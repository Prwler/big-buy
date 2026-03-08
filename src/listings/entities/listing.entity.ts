import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Category } from './category.entity';
import { ListingImage } from './listing-image.entity';

export type ListingCondition = 'new' | 'like_new' | 'good' | 'fair' | 'poor';
export type ListingStatus = 'draft' | 'active' | 'reserved' | 'sold' | 'removed';

@Entity('listings')
export class Listing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'seller_id' })
  sellerId: string;

  @Column({ name: 'category_id' })
  categoryId: string;

  @Column()
  title: string;

  @Column('text')
  description: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price: number;

  @Column({
    type: 'enum',
    enum: ['new', 'like_new', 'good', 'fair', 'poor'],
  })
  condition: ListingCondition;

  @Column({
    type: 'enum',
    enum: ['draft', 'active', 'reserved', 'sold', 'removed'],
    default: 'draft',
  })
  status: ListingStatus;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ name: 'view_count', default: 0 })
  viewCount: number;

  @Column({ type: 'jsonb', default: '{}' })
  attributes: Record<string, any>;

  // Maintained automatically by a Postgres trigger (see migration)
  @Exclude()
  @Column({
    name: 'search_vector',
    type: 'tsvector',
    select: false, // never returned in query results
    nullable: true,
  })
  searchVector: any;

  @Exclude()
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // ── Relations ────────────────────────────────────────────

  @ManyToOne(() => User)
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @ManyToOne(() => Category)
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @OneToMany(() => ListingImage, (img) => img.listing, { cascade: true })
  images: ListingImage[];
}