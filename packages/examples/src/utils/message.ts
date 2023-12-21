export class Message {
  role: string;
  content: string;

  constructor(role: string, content: string) {
    this.role = role;
    this.content = content;
  }
}
