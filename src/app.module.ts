import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { User } from './auth/entities/user.entity';
import { RefreshToken } from './auth/entities/refresh-token.entity';
import { Listing } from './listings/entities/listing.entity';
import { ListingImage } from './listings/entities/listing-image.entity';
import { Category } from './listings/entities/category.entity';
import { ListingsModule } from './listings/listings.module';
import { Order } from './orders/entities/order.entity';
import { Payment } from './orders/entities/payment.entity';
import { OrderStatusHistory } from './orders/entities/order-status-history.entity';
import { OrdersModule } from './orders/orders.module';
import { Review } from './reviews/entities/review.entity';
import { ReviewsModule } from './reviews/reviews.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.getOrThrow('DB_HOST'),
        port: config.getOrThrow<number>('DB_PORT'),
        username: config.getOrThrow('DB_USER'),
        password: config.getOrThrow('DB_PASSWORD'),
        database: config.getOrThrow('DB_NAME'),
        entities: [User, RefreshToken, Listing, ListingImage, Category, Order, OrderStatusHistory, Payment, Review],
        synchronize: true, // auto-creates tables in dev — turn off in production
      }),
    }),
    AuthModule, ListingsModule, OrdersModule, ReviewsModule, AnalyticsModule
  ],
})
export class AppModule {}