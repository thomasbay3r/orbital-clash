import { ClientMessage, ServerMessage } from "../../shared/types";

export class Connection {
  private ws: WebSocket | null = null;
  private messageHandlers: ((msg: ServerMessage) => void)[] = [];

  connect(roomId: string): void {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/room/${roomId}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log("Connected to game room:", roomId);
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ServerMessage;
      for (const handler of this.messageHandlers) {
        handler(msg);
      }
    };

    this.ws.onclose = () => {
      console.log("Disconnected from game room");
      this.ws = null;
    };

    this.ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  onMessage(handler: (msg: ServerMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
