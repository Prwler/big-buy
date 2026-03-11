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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.getOrThrow('DB_HOST'),
        port: config.getOrThrow<number>('DB_PORT'),
        username: config.getOrThrow('DB_USER'),
        password: config.getOrThrow('DB_PASSWORD'),
        database: config.getOrThrow('DB_NAME'),
        entities: [User, RefreshToken, Listing, ListingImage, Category, Order, OrderStatusHistory, Payment],
        synchronize: true, // auto-creates tables in dev — turn off in production
      }),
    }),
    AuthModule, ListingsModule, OrdersModule
  ],
})
export class AppModule {}