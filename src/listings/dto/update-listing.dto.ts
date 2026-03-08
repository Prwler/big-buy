import { PartialType } from '@nestjs/swagger';
import { CreateListingDto } from './create-listing.dto';

// All fields from CreateListingDto become optional automatically
export class UpdateListingDto extends PartialType(CreateListingDto) {}