import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { RefreshToken } from './refresh-token.entity';

export type UserRole = 'buyer' | 'seller' | 'admin';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  @Exclude() // never serialised in responses
  passwordHash: string;

  @Column({ type: 'enum', enum: ['buyer', 'seller', 'admin'], default: 'buyer' })
  role: UserRole;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // Stores the hashed 6-digit verification code + expiry
  @Column({ name: 'verification_code_hash', type: 'varchar', nullable: true })
  @Exclude()
  verificationCodeHash: string | null;

  @Column({ name: 'verification_code_expires_at', type: 'timestamptz', nullable: true })
  @Exclude()
  verificationCodeExpiresAt: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  @Exclude()
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens: RefreshToken[];
}