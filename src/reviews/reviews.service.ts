import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { Order } from '../orders/entities/order.entity';
import { User } from '../auth/entities/user.entity';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async create(dto: CreateReviewDto, reviewer: User): Promise<Review> {
    const order = await this.orderRepo.findOne({
      where: { id: dto.orderId },
    });

    if (!order) throw new NotFoundException('Order not found');

    // Only the buyer of the order can leave a review
    if (order.buyerId !== reviewer.id) {
      throw new ForbiddenException('Only the buyer can review this order');
    }

    // Order must be completed before a review can be left
    if (order.status !== 'completed') {
      throw new BadRequestException('You can only review a completed order');
    }

    // One review per order — enforced here and at DB level
    const existing = await this.reviewRepo.findOne({
      where: { orderId: dto.orderId },
    });
    if (existing)
      throw new ConflictException('You have already reviewed this order');

    const review = this.reviewRepo.create({
      orderId: dto.orderId,
      reviewerId: reviewer.id,
      sellerId: order.sellerId,
      rating: dto.rating,
      comment: dto.comment ?? null,
    });

    return this.reviewRepo.save(review);
  }

  async findBySeller(sellerId: string, page = 1, limit = 20) {
    const [items, total] = await this.reviewRepo.findAndCount({
      where: { sellerId, isVisible: true },
      relations: ['reviewer'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const avgRating = items.length
      ? items.reduce((sum, r) => sum + r.rating, 0) / items.length
      : 0;

    return {
      items,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
        avgRating: Math.round(avgRating * 10) / 10,
      },
    };
  }

  async findOne(id: string): Promise<Review> {
    const review = await this.reviewRepo.findOne({
      where: { id, isVisible: true },
      relations: ['reviewer', 'order'],
    });
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  // Admin only — hide a review without deleting it
  async hide(id: string): Promise<Review> {
    const review = await this.reviewRepo.findOne({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    review.isVisible = false;
    return this.reviewRepo.save(review);
  }
}
