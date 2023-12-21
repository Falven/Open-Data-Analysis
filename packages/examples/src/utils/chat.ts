import { readFile, writeFile } from 'node:fs/promises';
import { isPromise } from 'node:util/types';
import { createInterface } from 'node:readline';
import prompts from 'prompts';
import 'reflect-metadata';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import chalk from 'chalk';

import { Conversation } from './conversation.js';
import { Message } from './message.js';

export type ChatMap = { [username: string]: Conversation[] };

export enum Command {
  Exit = '.exit',
  SelectUser = '.user',
  SelectConversation = '.conversation',
  ConfirmHub = '.hub',
}

export const isCommand = (value: string): value is Command =>
  Object.values(Command).includes(value as Command);

export type GenerateAssistantResponse = (
  message: Message,
) => AsyncGenerator<string> | Promise<string> | string;

export type OnUserSettingsChangeCb = (
  username: string,
  conversation: Conversation,
  useHub: boolean,
) => void | Promise<void>;

export type OnUserMessageCb = (message: Message) => void | Promise<void>;

export type OnAssistantMessageCb = (message: Message) => void | Promise<void>;

export type OnExitCb = () => void | Promise<void>;

export class Chat {
  private static ChatFile = 'chat.json';

  private chatMap: ChatMap;
  private currentUser: string | undefined;
  private currentConversation: Conversation | undefined;
  private useHub: boolean | undefined;
  private _generateAssistantResponse: GenerateAssistantResponse;
  private _onUserSettingsChange?: OnUserSettingsChangeCb;
  private _onUserMessage?: OnUserMessageCb;
  private _onAssistantMessage?: OnAssistantMessageCb;
  private _onExit?: OnExitCb;

  constructor() {
    this.chatMap = {};
    this._generateAssistantResponse = () => 'You must implement generateAssistantResponse()';
  }

  set generateAssistantResponse(callback: GenerateAssistantResponse) {
    this._generateAssistantResponse = callback;
  }

  set onUserSettingsChange(callback: OnUserSettingsChangeCb) {
    this._onUserSettingsChange = callback;
  }

  set onUserMessage(callback: OnUserMessageCb) {
    this._onUserMessage = callback;
  }

  set onAssistantMessage(callback: OnAssistantMessageCb) {
    this._onAssistantMessage = callback;
  }

  set onExit(callback: OnExitCb) {
    this._onExit = callback;
  }

  private async promptForUseHub(): Promise<void> {
    this.useHub = (
      await prompts({
        type: 'confirm',
        name: 'useHub',
        message: 'Connect to a JupyterHub instance?',
        initial: true,
      })
    ).useHub;
  }

  private async promptForNewUser(): Promise<void> {
    const { userName } = await prompts({
      type: 'text',
      name: 'userName',
      message: 'Enter a username:',
    });
    this.chatMap[userName] = [];
    this.currentUser = userName;
  }

  private async promptForUser(): Promise<void> {
    const { userName } = await prompts(
      {
        type: 'select',
        name: 'userName',
        message: 'Select a user',
        choices: [
          { title: 'Create new user', description: '', value: null, disabled: false },
          ...Array.from(Object.keys(this.chatMap)).map((userName) => ({
            title: userName,
            description: '',
            value: userName,
            disabled: false,
          })),
        ],
      },
      { onCancel: () => process.exit(0) },
    );

    if (userName === null) {
      await this.promptForNewUser();
    } else {
      this.currentUser = userName;
    }
  }

  private createNewConversation(userName: string): Conversation {
    const newConversation = new Conversation();
    this.chatMap[userName].push(newConversation);
    return newConversation;
  }

  private async promptForConversation(): Promise<void> {
    if (this.currentUser === undefined) {
      throw new Error("Unexpected 'undefined' encountered for 'currentUser'");
    }

    const { conversation } = await prompts({
      type: 'select',
      name: 'conversation',
      message: 'Select a conversation',
      choices: [
        { title: 'Start a new conversation', value: null },
        ...(this.chatMap[this.currentUser] ?? []).map((conversation: Conversation) => ({
          title: conversation.title,
          value: conversation,
        })),
      ],
    });

    this.currentConversation =
      conversation === null ? this.createNewConversation(this.currentUser) : conversation;
  }

  logCurrentConversation() {
    if (this.currentConversation === undefined) {
      throw new Error("Unexpected 'undefined' encountered for 'currentConversation'");
    }

    for (const message of this.currentConversation.messages) {
      if (message.role === 'system') {
        continue;
      }
      console.log(`${message.role === 'user' ? 'You' : 'Assistant'}: ${message.content}`);
    }
  }

  private async logAssistantResponse(): Promise<void> {
    if (this.currentConversation === undefined) {
      throw new Error("Unexpected 'undefined' encountered for 'currentConversation'");
    }

    const lastMessage = this.currentConversation.messages.at(-1);
    if (lastMessage === undefined) {
      return;
    }

    const assistantResponse = this._generateAssistantResponse(lastMessage);

    let messageContent = '';
    process.stdout.write('Assistant: ');
    if (typeof assistantResponse === 'object' && Symbol.asyncIterator in assistantResponse) {
      for await (const token of assistantResponse) {
        messageContent += token;
        process.stdout.write(token);
      }
    } else if (isPromise(assistantResponse)) {
      messageContent = (await assistantResponse) as string;
      process.stdout.write(messageContent);
    } else if (typeof assistantResponse === 'string') {
      messageContent = assistantResponse;
      process.stdout.write(messageContent);
    } else {
      throw new Error('Unexpected response from assistant');
    }
    process.stdout.write('\n');

    if (this.currentConversation === undefined) {
      throw new Error("Unexpected 'undefined' encountered for 'currentConversation'");
    }

    const assistantMessage = new Message('assistant', messageContent);
    this.currentConversation.messages.push(assistantMessage);

    const assistantMessageCb = this?._onAssistantMessage?.(assistantMessage);
    if (isPromise(assistantMessageCb)) {
      await assistantMessageCb;
    }
  }

  logCommands() {
    console.log(chalk.blue.bold('Commands:'));
    console.log(chalk.blue.bold('  .user: ') + chalk.blue('Switch users'));
    console.log(chalk.blue.bold('  .conversation: ') + chalk.blue('Switch conversations'));
    console.log(chalk.blue.bold('  .hub: ') + chalk.blue('Connect to a JupyterHub instance'));
    console.log(chalk.blue.bold('  .exit: ') + chalk.blue('Exit'));
  }

  private async promptForMessage(): Promise<Command> {
    const command: Command = await new Promise<Command>((resolve, reject) => {
      if (this.currentConversation === undefined) {
        reject(new Error("Unexpected 'undefined' encountered for 'currentConversation'"));
        return;
      }

      const history = this.currentConversation.messages.reduce(
        (acc: string[], message: Message) => {
          if (message.role === 'user') {
            acc.push(message.content);
          }
          return acc;
        },
        [],
      );

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        history,
        prompt: 'You: ',
      });

      rl.on('SIGINT', (): void => resolve(Command.Exit));

      rl.on('line', async (input: string): Promise<void> => {
        const trimmedInput = input.trim();
        if (isCommand(trimmedInput)) {
          rl.close();
          resolve(trimmedInput);
        } else {
          if (this.currentConversation === undefined) {
            throw new Error("Unexpected 'undefined' encountered for 'currentConversation'");
          }

          const userMessage = new Message('user', input);
          this.currentConversation.messages.push(userMessage);
          const userMessageCb = this?._onUserMessage?.(userMessage);
          if (isPromise(userMessageCb)) {
            await userMessageCb;
          }
          await this.logAssistantResponse();
          rl.prompt();
        }
      });
      rl.prompt();
    });
    return command;
  }

  async loop(): Promise<void> {
    let command: Command = Command.ConfirmHub;
    while (true) {
      switch (command) {
        case Command.Exit:
          const exitCb = this?._onExit?.();
          if (isPromise(exitCb)) {
            await exitCb;
          }

          console.log('Exiting...');
          process.exit(0);
        case Command.ConfirmHub:
          await this.promptForUseHub();
        case Command.SelectUser:
          await this.promptForUser();
        case Command.SelectConversation:
          await this.promptForConversation();
          this.logCommands();
          this.logCurrentConversation();
        default:
          if (this.currentUser === undefined) {
            throw new Error("Unexpected 'undefined' encountered for 'currentUser'");
          }
          if (this.currentConversation === undefined) {
            throw new Error("Unexpected 'undefined' encountered for 'currentConversation'");
          }
          if (this.useHub === undefined) {
            throw new Error("Unexpected 'undefined' encountered for 'useHub'");
          }

          const settingsCb = this?._onUserSettingsChange?.(
            this.currentUser,
            this.currentConversation,
            this.useHub,
          );
          if (isPromise(settingsCb)) {
            await settingsCb;
          }

          command = await this.promptForMessage();
      }
    }
  }

  async load(chatFile: string = Chat.ChatFile): Promise<void> {
    try {
      const data = await readFile(chatFile, 'utf-8');
      this.chatMap = JSON.parse(data);
      const keys = Object.keys(this.chatMap) as (keyof ChatMap)[];
      for (const key of keys) {
        this.chatMap[key] = plainToInstance(Conversation, this.chatMap[key]);
      }
    } catch (error) {
      this.chatMap = {};
    }
  }

  async save(chatFile: string = Chat.ChatFile): Promise<void> {
    const data = JSON.stringify(instanceToPlain(this.chatMap), null, 2);
    await writeFile(chatFile, data, { encoding: 'utf-8' });
  }
}
