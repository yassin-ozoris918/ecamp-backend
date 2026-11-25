import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SupportBotService } from './support-bot.service';
import { ResolveQueriesDto, SupportFaqDto, TestBotDto } from './dto/support-faq.dto';

/** Admin management of the support chatbot's questions and answers. */
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/support-bot')
export class SupportBotAdminController {
  constructor(private readonly bot: SupportBotService) {}

  @Get('faqs')
  list() {
    return this.bot.listFaqs();
  }

  @Post('faqs')
  create(@Body() dto: SupportFaqDto) {
    return this.bot.createFaq(dto);
  }

  @Patch('faqs/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SupportFaqDto) {
    return this.bot.updateFaq(id, dto);
  }

  @Delete('faqs/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.bot.deleteFaq(id);
  }

  @Post('faqs/starter')
  addStarter() {
    return this.bot.addStarterFaqs();
  }

  @Get('unanswered')
  unanswered(@Query('take') take?: string) {
    return this.bot.unanswered(take ? parseInt(take, 10) || 100 : 100);
  }

  @Post('unanswered/resolve')
  resolve(@Body() dto: ResolveQueriesDto) {
    return this.bot.resolve(dto.ids);
  }

  @Get('stats')
  stats(@Query('days') days?: string) {
    return this.bot.stats(days ? parseInt(days, 10) || 30 : 30);
  }

  @Post('test')
  test(@Body() dto: TestBotDto) {
    return this.bot.test(dto.message);
  }
}
