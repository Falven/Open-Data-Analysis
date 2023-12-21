import { randomUUID } from 'node:crypto';
import { Type } from 'class-transformer';

import { Message } from './message.js';

export class Conversation {
  id: string;
  @Type(() => Message)
  messages: Message[];

  get title(): string {
    if (this.messages.length > 1) {
      return this.messages[1].content.length > 9
        ? this.messages[1].content.substring(0, 10) + '...'
        : this.messages[1].content;
    } else {
      return this.id;
    }
  }

  constructor() {
    this.id = randomUUID();
    this.messages = [];
  }
}
