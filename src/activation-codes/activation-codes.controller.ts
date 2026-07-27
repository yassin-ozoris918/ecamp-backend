import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { ActivationCodesService } from './activation-codes.service';
import { GenerateCodesDto } from './dto/generate-codes.dto';
import { RedeemCodeDto } from './dto/redeem-code.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import { ThrottlerGuard } from '@nestjs/throttler';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('activation-codes')
export class ActivationCodesController {
  constructor(
    private readonly activationCodesService: ActivationCodesService,
  ) {}

  @Roles(Role.ADMIN)
  @Get()
  getAllCodes(
    @Query('skip') skip?: string, 
    @Query('take') take?: string, 
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('targetType') targetType?: string,
    @Query('educationLevel') educationLevel?: string,
  ) {
    const parsedSkip = skip ? parseInt(skip, 10) : 0;
    const parsedTake = take ? parseInt(take, 10) : 50;
    return this.activationCodesService.getAllCodes(parsedSkip, parsedTake, search, status, targetType, educationLevel);
  }

  @Roles(Role.ADMIN)
  @Post('generate')
  generateCodes(@Body() dto: GenerateCodesDto, @Req() req: RequestWithUser) {
    return this.activationCodesService.generateCodes(dto, req.user.sub);
  }

  @Roles(Role.ADMIN)
  @Post(':id/deactivate')
  deactivateCode(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.activationCodesService.deactivateCode(id, req.user.sub);
  }

  @Roles(Role.ADMIN)
  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.activationCodesService.getHistory(id);
  }


  @UseGuards(ThrottlerGuard)
  @Roles(Role.STUDENT)
  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  redeemCode(@Body() dto: RedeemCodeDto, @Req() req: RequestWithUser) {
    const ip = req.ip || req.socket?.remoteAddress;
    const browser = req.headers['user-agent'];
    return this.activationCodesService.redeemCode(dto, req.user.sub, ip, browser);
  }
}
