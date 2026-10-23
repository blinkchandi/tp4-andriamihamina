// Composition et démonstration : le seul fichier qui assemble les patterns entre eux.
// Lancer : node seance4-patterns/tp4-andriamihamina/main.js
import { fileURLToPath } from 'node:url';
import { ColissimoApi, DhlClient } from '../tp4/carrierApis.js';
import { createChannel } from './notifications/channels.js';
import './notifications/slack.js'; // installe le canal Slack (OCP : channels.js inchangé)
import { MessageBuilder } from './notifications/MessageBuilder.js';
import { ColissimoAdapter, DhlAdapter } from './shipping/adapters.js';
import { CachedQuote, RetryQuote } from './shipping/decorators.js';
import { ShippingService } from './shipping/ShippingService.js';

export function buildShipping({ dhlClient = new DhlClient({ failFirst: 1 }) } = {}) {
  return new ShippingService([
    // Colissimo est synchrone et ne tombe pas en panne : un cache suffit
    new CachedQuote(new ColissimoAdapter(new ColissimoApi())),
    // DHL est instable : cache(retry(...)), le cache enveloppe le retry
    new CachedQuote(new RetryQuote(new DhlAdapter(dhlClient))),
  ]);
}

export async function demo(log = console.log) {
  const shipping = buildShipping();
  const email = createChannel('email');
  for (const weightKg of [2, 10]) {
    const best = await shipping.bestQuote({ weightKg, zip: '75011' });
    const message = new MessageBuilder()
      .to('alice@exemple.fr')
      .template('Bonjour {{nom}}, votre colis de {{poids}} kg part avec {{transporteur}} ({{prix}} €).')
      .with('nom', 'Alice')
      .with('poids', weightKg)
      .with('transporteur', best.carrier)
      .with('prix', best.price.toFixed(2))
      .build();
    log(email.send(message));
  }
  const notice = new MessageBuilder().to('logistique').template('Tarifs mis à jour').build();
  log(createChannel('slack').send(notice));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await demo();
}
