// Nouveau canal Slack, ajouté SANS modifier channels.js : il suffit d'importer ce fichier.
import { Channel, registerChannel } from './channels.js';

export class SlackChannel extends Channel {
  send({ to, body }) {
    return `[SLACK #${to}] ${body}`;
  }
}

registerChannel('slack', SlackChannel);
