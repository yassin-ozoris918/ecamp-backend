import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SupportBotService } from './support-bot.service';
import { AskBotDto, BotFeedbackDto, PickFaqDto } from './dto/support-faq.dto';

/**
 * Public support chatbot. Usable before signing in (e.g. "my account is pending"), so it never reads
 * the caller's identity and has no access to accounts, codes or admin data: it only returns
 * admin-written FAQ answers or a fixed refusal.
 */
@Controller('support-bot')
export class SupportBotController {
  constructor(private readonly bot: SupportBotService) {}

  @Get('suggestions')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  suggestions(@Query('lang') lang?: string) {
    return this.bot.suggestions(lang);
  }

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  ask(@Body() dto: AskBotDto) {
    return this.bot.ask(dto.message, dto.lang);
  }

  @Post('pick')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  pick(@Body() dto: PickFaqDto) {
    return this.bot.pick(dto.faqId, dto.lang);
  }

  @Post('feedback')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  feedback(@Body() dto: BotFeedbackDto) {
    return this.bot.feedback(dto.id, dto.helpful);
  }
}
