import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { Payment } from './entities/payment.entity';
import { Listing } from '../listings/entities/listing.entity';
import { User } from '../auth/entities/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';

// ── State machine ────────────────────────────────────────────────
// pending → paid → shipped → delivered → completed
// pending → cancelled
// paid    → refunded
// ────────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:   ['paid', 'cancelled'],
  paid:      ['shipped', 'refunded'],
  shipped:   ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
  refunded:  [],
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Create ───────────────────────────────────────────────

  async create(dto: CreateOrderDto, buyer: User): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const listing = await manager.findOne(Listing, {
        where: { id: dto.listingId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!listing) throw new NotFoundException('Listing not found');
      if (listing.status !== 'active') {
        throw new ConflictException('Listing is no longer available');
      }
      if (listing.sellerId === buyer.id) {
        throw new BadRequestException('You cannot buy your own listing');
      }

      const totalAmount = Number(listing.price) + Number(dto.shippingFee ?? 0);

      const order = manager.create(Order, {
        buyerId: buyer.id,
        sellerId: listing.sellerId,
        listingId: listing.id,
        amount: listing.price,
        shippingFee: dto.shippingFee ?? 0,
        totalAmount,
        shippingAddress: dto.shippingAddress,
        status: 'pending',
      });

      await manager.save(order);

      // Reserve listing to prevent duplicate orders
      listing.status = 'reserved';
      await manager.save(listing);

      // Create pending payment record
      await manager.save(
        manager.create(Payment, {
          orderId: order.id,
          amount: totalAmount,
          status: 'pending',
        }),
      );

      return order;
    });
  }

  // ── Read ─────────────────────────────────────────────────

  async findOne(id: string, user: User): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: ['listing', 'listing.images', 'payment', 'statusHistory'],
    });
    if (!order) throw new NotFoundException('Order not found');
    this.assertAccess(order, user);
    return order;
  }

  async findMyOrders(user: User, role: 'buyer' | 'seller', page = 1, limit = 20) {
    const where = role === 'buyer' ? { buyerId: user.id } : { sellerId: user.id };

    const [items, total] = await this.orderRepo.findAndCount({
      where,
      relations: ['listing', 'listing.images', 'payment'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── State transitions ────────────────────────────────────

  async confirmPayment(orderId: string, user: User): Promise<Order> {
    return this.transition(orderId, 'paid', user, async (order, manager) => {
      order.status = 'paid';
      await manager.update(Payment, { orderId }, {
        status: 'completed',
        paidAt: new Date(),
        providerRef: `mock_${Date.now()}`,
      });
    });
  }

  async markShipped(orderId: string, trackingNumber: string, user: User): Promise<Order> {
    return this.transition(orderId, 'shipped', user, async (order) => {
      order.status = 'shipped';
      order.trackingNumber = trackingNumber;
      order.shippedAt = new Date();
    });
  }

  async markDelivered(orderId: string, user: User): Promise<Order> {
    return this.transition(orderId, 'delivered', user, async (order) => {
      order.status = 'delivered';
      order.deliveredAt = new Date();
    });
  }

  async complete(orderId: string, user: User): Promise<Order> {
    return this.transition(orderId, 'completed', user, async (order, manager) => {
      order.status = 'completed';
      order.completedAt = new Date();
      await manager.update(Listing, { id: order.listingId }, { status: 'sold' });
    });
  }

  async cancel(orderId: string, reason: string, user: User): Promise<Order> {
    return this.transition(orderId, 'cancelled', user, async (order, manager) => {
      order.status = 'cancelled';
      order.cancelledAt = new Date();
      order.cancelReason = reason;
      await manager.update(Listing, { id: order.listingId }, { status: 'active' });
    });
  }

  // ── Private helpers ──────────────────────────────────────

  private async transition(
    orderId: string,
    toStatus: string,
    user: User,
    applyChange: (order: Order, manager: any) => Promise<void>,
  ): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) throw new NotFoundException('Order not found');
      this.assertAccess(order, user);
      this.assertValidTransition(order.status, toStatus);

      await applyChange(order, manager);
      return manager.save(order);
    });
  }

  private assertValidTransition(from: string, to: string) {
    if (!VALID_TRANSITIONS[from]?.includes(to)) {
      throw new BadRequestException(`Invalid transition: ${from} → ${to}`);
    }
  }

  private assertAccess(order: Order, user: User) {
    const isParty = order.buyerId === user.id || order.sellerId === user.id;
    if (!isParty && user.role !== 'admin') {
      throw new ForbiddenException('Access denied');
    }
  }
}