import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Listing } from './entities/listing.entity';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { SearchListingsDto } from './dto/search-listings.dto';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
  ) {}

  async create(dto: CreateListingDto, seller: User): Promise<Listing> {
    const listing = this.listingRepo.create({
      ...dto,
      sellerId: seller.id,
      status: 'draft',
    });
    return this.listingRepo.save(listing);
  }

  async findAll(query: SearchListingsDto) {
    const {
      q,
      categoryId,
      condition,
      minPrice,
      maxPrice,
      location,
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = query;

    const qb = this.listingRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.images', 'img', 'img.is_primary = true')
      .leftJoinAndSelect('l.category', 'cat')
      .leftJoinAndSelect('l.seller', 'seller')
      .where('l.status = :status', { status: 'active' })
      .andWhere('l.deletedAt IS NULL');

    if (q) {
      qb.andWhere(
        `l.search_vector @@ plainto_tsquery('english', :q)`,
        { q },
      );
    }

    if (categoryId) qb.andWhere('l.categoryId = :categoryId', { categoryId });
    if (condition) qb.andWhere('l.condition = :condition', { condition });
    if (minPrice) qb.andWhere('l.price >= :minPrice', { minPrice });
    if (maxPrice) qb.andWhere('l.price <= :maxPrice', { maxPrice });
    if (location) qb.andWhere('l.location ILIKE :location', { location: `%${location}%` });

    const allowedSort: Record<string, string> = {
      created_at: 'l.createdAt',
      price: 'l.price',
      view_count: 'l.viewCount',
    };

    qb.orderBy(allowedSort[sortBy] ?? 'l.createdAt', sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<Listing> {
    const listing = await this.listingRepo.findOne({
      where: { id },
      relations: ['images', 'category', 'seller'],
    });
    if (!listing) throw new NotFoundException('Listing not found');

    // view count increment
    this.listingRepo.increment({ id }, 'viewCount', 1);

    return listing;
  }

  async update(id: string, dto: UpdateListingDto, user: User): Promise<Listing> {
    const listing = await this.findOne(id);
    this.assertOwnership(listing, user);

    if (['sold', 'removed'].includes(listing.status)) {
      throw new ForbiddenException(`Cannot edit a listing with status: ${listing.status}`);
    }

    Object.assign(listing, dto);
    return this.listingRepo.save(listing);
  }

  async publish(id: string, user: User): Promise<Listing> {
    const listing = await this.findOne(id);
    this.assertOwnership(listing, user);
    listing.status = 'active';
    return this.listingRepo.save(listing);
  }

  async remove(id: string, user: User): Promise<void> {
    const listing = await this.findOne(id);
    if (user.role !== 'admin') this.assertOwnership(listing, user);
    listing.deletedAt = new Date();
    listing.status = 'removed';
    await this.listingRepo.save(listing);
  }

  async findBySeller(sellerId: string, page = 1, limit = 20) {
    const [items, total] = await this.listingRepo.findAndCount({
      where: { sellerId },
      relations: ['images', 'category'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Private helpers ──────────────────────────────────────

  private assertOwnership(listing: Listing, user: User) {
    if (listing.sellerId !== user.id) {
      throw new ForbiddenException('You do not own this listing');
    }
  }
}