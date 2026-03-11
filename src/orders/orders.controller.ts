import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ShipOrderDto, CancelOrderDto } from './dto/order-actions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('buyer', 'admin')
  @ApiOperation({ summary: 'Place an order for a listing' })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: User) {
    return this.ordersService.create(dto, user);
  }

  @Get('me/buying')
  @ApiOperation({ summary: 'Get orders where I am the buyer' })
  myPurchases(
    @CurrentUser() user: User,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ordersService.findMyOrders(user, 'buyer', page, limit);
  }

  @Get('me/selling')
  @UseGuards(RolesGuard)
  @Roles('seller', 'admin')
  @ApiOperation({ summary: 'Get orders where I am the seller' })
  mySales(
    @CurrentUser() user: User,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ordersService.findMyOrders(user, 'seller', page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single order (buyer or seller only)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.ordersService.findOne(id, user);
  }

  @Patch(':id/pay')
  @ApiOperation({ summary: 'Confirm payment (mock) — pending → paid' })
  confirmPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.ordersService.confirmPayment(id, user);
  }

  @Patch(':id/ship')
  @UseGuards(RolesGuard)
  @Roles('seller', 'admin')
  @ApiOperation({ summary: 'Mark as shipped — paid → shipped' })
  ship(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShipOrderDto,
    @CurrentUser() user: User,
  ) {
    return this.ordersService.markShipped(id, dto.trackingNumber, user);
  }

  @Patch(':id/deliver')
  @UseGuards(RolesGuard)
  @Roles('buyer', 'admin')
  @ApiOperation({ summary: 'Confirm delivery — shipped → delivered' })
  deliver(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.ordersService.markDelivered(id, user);
  }

  @Patch(':id/complete')
  @UseGuards(RolesGuard)
  @Roles('buyer', 'admin')
  @ApiOperation({ summary: 'Complete order — delivered → completed' })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.ordersService.complete(id, user);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel an order — only valid before payment' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: User,
  ) {
    return this.ordersService.cancel(id, dto.reason, user);
  }
}