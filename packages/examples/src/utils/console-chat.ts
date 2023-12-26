import { readFile, writeFile } from 'node:fs/promises';
import { isPromise } from 'node:util/types';
import { AsyncCompleter, CompleterResult, createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import prompts from 'prompts';
import 'reflect-metadata';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import chalk from 'chalk';
import { getCompletions } from './files.js';

export type ToolInvocation = {
  name: string;
  input: string;
  output: string;
};

export enum MessageRole {
  System = 'system',
  User = 'user',
  Assistant = 'assistant',
}

export enum FriendlyRole {
  System = 'System',
  User = 'You',
  Assistant = 'Assistant',
}

export const roleMapping: Record<MessageRole, FriendlyRole> = {
  [MessageRole.System]: FriendlyRole.System,
  [MessageRole.User]: FriendlyRole.User,
  [MessageRole.Assistant]: FriendlyRole.Assistant,
};

export type Message = {
  id: string;
  role: MessageRole;
  content: string;
  toolInvocations?: ToolInvocation[];
};

export class Conversation {
  id: string;
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

export const isAsyncIterable = (object: unknown): object is AsyncIterable<unknown> =>
  object != null && typeof object === 'object' && Symbol.asyncIterator in object;

export type ChatMap = { [username: string]: Conversation[] };

export type GenerateAssistantResponse = (
  username: string,
  conversation: Conversation,
  message: Message,
) => AsyncGenerator<Message, void, void> | Promise<Message> | Message;

export type OnUserSettingsChangeCb = (
  username: string,
  conversation: Conversation,
  useHub: boolean,
) => void | Promise<void>;

export type HandleUploadCb = (
  username: string,
  conversation: Conversation,
  filePath: string,
) => Message | void | Promise<Message | void>;

export type OnUserMessageCb = (
  username: string,
  conversation: Conversation,
  message: Message,
) => void | Promise<void>;

export type OnAssistantMessageCb = (
  username: string,
  conversation: Conversation,
  message: Message,
) => void | Promise<void>;

export type OnExitCb = () => void | Promise<void>;

export enum Command {
  Exit = '.exit',
  SelectUser = '.user',
  SelectConversation = '.conversation',
  ConfirmHub = '.hub',
  Upload = '.upload',
  Help = '.help',
}

export const isCommand = (input: string): input is Command =>
  Object.values(Command).find((value: Command) => input.includes(value)) !== undefined;

export class ConsoleChat {
  private static ChatFile = 'chat.json';

  private chatMap: ChatMap;
  private currentUser: string | undefined;
  private currentConversation: Conversation | undefined;
  private useHub: boolean | undefined;
  private _generateAssistantResponse: GenerateAssistantResponse;
  private _handleUpload?: HandleUploadCb;
  private _onUserSettingsChange?: OnUserSettingsChangeCb;
  private _onUserMessage?: OnUserMessageCb;
  private _onAssistantMessage?: OnAssistantMessageCb;
  private _onExit?: OnExitCb;

  constructor() {
    this.chatMap = {};
    this._generateAssistantResponse = (): Message => ({
      id: '-1',
      role: MessageRole.System,
      content: chalk.redBright('You must implement generateAssistantResponse()!'),
    });
  }

  set generateAssistantResponse(callback: GenerateAssistantResponse) {
    this._generateAssistantResponse = callback;
  }

  set handleUpload(callback: HandleUploadCb) {
    this._handleUpload = callback;
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

  private async raiseFileUpload(filePath: string): Promise<void> {
    try {
      if (this?._handleUpload === undefined) {
        return;
      }

      if (!filePath) {
        console.error(chalk.red('No file path provided for upload.'));
        return;
      }

      if (this.currentUser === undefined) {
        throw new Error("Unexpected 'undefined' encountered for 'currentUser'");
      }

      if (this.currentConversation === undefined) {
        throw new Error("Unexpected 'undefined' encountered for 'currentConversation'");
      }

      const result = this._handleUpload(this.currentUser, this.currentConversation, filePath);
      const systemMessage = isPromise(result) ? await result : result;

      if (systemMessage !== undefined) {
        this.currentConversation.messages.push(systemMessage);
      }
    } catch (error) {
      console.error(chalk.red(error));
    }
  }

  logCurrentConversation() {
    if (this.currentConversation === undefined) {
      throw new Error("Unexpected 'undefined' encountered for 'currentConversation'");
    }

    console.log(chalk.bold(`Start of conversation ${this.currentConversation.id}:`));

    for (const message of this.currentConversation.messages) {
      console.log(`${roleMapping[message.role]}: ${message.content}`);
    }
  }

  logToolInvocations(toolInvocations: ToolInvocation[] | undefined) {
    if (toolInvocations === undefined) {
      return;
    }

    for (const toolInvocation of toolInvocations) {
      const { name, input, output } = toolInvocation;
      const trail = chalk.yellow('-').repeat(100);

      console.log(trail);
      console.log(chalk.bold.yellow(name));
      console.log(trail);
      console.log(chalk.bold('Input:'));
      console.log(input);
      console.log(trail);
      console.log(chalk.bold('Output:'));
      console.log(output);
      console.log(trail);
    }
  }

  private async logStreamingResponse(
    response: AsyncIterable<Message>,
  ): Promise<Message | undefined> {
    let message: Message | undefined = undefined;
    let toolsLogged = false;

    for await (const chunk of response) {
      message = chunk;

      if (message.toolInvocations !== undefined && toolsLogged === false) {
        this.logToolInvocations(message.toolInvocations);
        toolsLogged = true;
      }

      process.stdout.write(message.content);
    }

    return message;
  }

  private async logResponse(response: Promise<Message> | Message): Promise<Message> {
    const message = isPromise(response) ? await response : response;
    this.logToolInvocations(message.toolInvocations);
    process.stdout.write(message.content);
    return message;
  }

  private async logAssistantResponse(): Promise<void> {
    if (this.currentUser === undefined) {
      throw new Error("Unexpected 'undefined' encountered for 'currentUser'");
    }

    if (this.currentConversation === undefined) {
      throw new Error("Unexpected 'undefined' encountered for 'currentConversation'");
    }

    const lastMessage = this.currentConversation.messages.at(-1);
    if (lastMessage === undefined) {
      return;
    }

    const assistantResponse = this._generateAssistantResponse(
      this.currentUser,
      this.currentConversation,
      lastMessage,
    );

    let message: Message | undefined = undefined;
    process.stdout.write(chalk.bold(`${FriendlyRole.Assistant}: `));

    if (isAsyncIterable(assistantResponse)) {
      message = await this.logStreamingResponse(assistantResponse);
    } else {
      message = await this.logResponse(assistantResponse);
    }

    process.stdout.write('\n');

    if (message === undefined) {
      throw new Error("Unexpected assistant response 'undefined'");
    }

    if (this.currentConversation === undefined) {
      throw new Error("Unexpected 'undefined' encountered for 'currentConversation'");
    }

    this.currentConversation.messages.push(message);

    const assistantMessageCb = this?._onAssistantMessage?.(
      this.currentUser,
      this.currentConversation,
      message,
    );
    if (isPromise(assistantMessageCb)) {
      await assistantMessageCb;
    }
  }

  logCommands() {
    console.log(chalk.blue.bold('Commands:'));
    console.log(chalk.blue.bold('  .user: ') + chalk.blue('Switch users'));
    console.log(chalk.blue.bold('  .conversation: ') + chalk.blue('Switch conversations'));
    console.log(
      chalk.blue.bold('  .hub: ') +
        chalk.blue('Whether to connect to a JupyterHub or Jupyter Server instance'),
    );
    console.log(
      chalk.blue.bold('  .upload <file>: ') +
        chalk.blue('Upload a file to the current conversation'),
    );
    console.log(chalk.blue.bold('  .exit: ') + chalk.blue('Save and exit'));
  }

  private completer: AsyncCompleter = (
    line: string,
    callback: (err?: Error | null | undefined, result?: CompleterResult | undefined) => void,
  ): void => {
    const tokens = line.split(/\s+/);

    if (tokens[0] !== Command.Upload || tokens.length < 1) {
      callback(null, [[], line]);
      return;
    }

    const lastToken = tokens.at(-1);
    if (lastToken === undefined) {
      callback(null, [[], line]);
      return;
    }

    getCompletions(lastToken)
      .then((hits: string[]) => {
        callback(null, [hits, tokens[1]]);
      })
      .catch((err) => {
        callback(err);
      });
  };

  private async promptForMessage(): Promise<Command> {
    const command: Command = await new Promise<Command>((resolve, reject) => {
      if (this.currentConversation === undefined) {
        reject(new Error("Unexpected 'undefined' encountered for 'currentConversation'"));
        return;
      }

      const history = this.currentConversation.messages.map((message: Message) => message.content);

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        history,
        prompt: chalk.bold(`${FriendlyRole.User}: `),
        completer: this.completer.bind(this),
      });

      rl.on('SIGINT', (): void => resolve(Command.Exit));

      rl.on('line', async (input: string): Promise<void> => {
        const trimmedInput = input.trim();

        if (isCommand(trimmedInput)) {
          rl.close();
          resolve(trimmedInput);
        } else {
          if (this.currentUser === undefined) {
            throw new Error("Unexpected 'undefined' encountered for 'currentUser'");
          }
          if (this.currentConversation === undefined) {
            throw new Error("Unexpected 'undefined' encountered for 'currentConversation'");
          }

          const userMessage: Message = { id: randomUUID(), role: MessageRole.User, content: input };

          this.currentConversation.messages.push(userMessage);

          const userMessageCb = this?._onUserMessage?.(
            this.currentUser,
            this.currentConversation,
            userMessage,
          );
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
    let message: string = Command.ConfirmHub;

    while (true) {
      let [command, arg] = message.split(/\s+/) as [Command, string];

      switch (command) {
        case Command.Exit:
          const exitCb = this?._onExit?.();
          if (isPromise(exitCb)) {
            await exitCb;
          }

          console.log('Exiting...');
          process.exit(0);
        case Command.Help:
          this.logCommands();
          break;
        case Command.Upload:
          const filePath = arg.trim();
          await this.raiseFileUpload(filePath);
          break;
        case Command.ConfirmHub:
          await this.promptForUseHub();
        case Command.SelectUser:
          await this.promptForUser();
        case Command.SelectConversation:
          await this.promptForConversation();
          this.logCommands();
          this.logCurrentConversation();
      }

      if (this.currentUser === undefined) {
        command = Command.SelectUser;
        continue;
      }
      if (this.currentConversation === undefined) {
        command = Command.SelectConversation;
        continue;
      }
      if (this.useHub === undefined) {
        command = Command.ConfirmHub;
        continue;
      }

      if (
        command === Command.SelectUser ||
        command === Command.SelectConversation ||
        command === Command.ConfirmHub
      ) {
        const settingsCb = this?._onUserSettingsChange?.(
          this.currentUser,
          this.currentConversation,
          this.useHub,
        );
        if (isPromise(settingsCb)) {
          await settingsCb;
        }
      }

      message = await this.promptForMessage();
    }
  }

  async load(chatFile: string = ConsoleChat.ChatFile): Promise<void> {
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

  async save(chatFile: string = ConsoleChat.ChatFile): Promise<void> {
    const data = JSON.stringify(instanceToPlain(this.chatMap), null, 2);
    await writeFile(chatFile, data, { encoding: 'utf-8' });
  }
}
