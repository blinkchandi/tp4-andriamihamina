// Tests du TP 4 · lancer : node --test seance4-patterns/tp4-andriamihamina/tp4.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Channel, createChannel, registerChannel } from './notifications/channels.js';
import { MessageBuilder } from './notifications/MessageBuilder.js';
import { ColissimoApi, DhlClient } from '../tp4/carrierApis.js';
import { ColissimoAdapter, DhlAdapter } from './shipping/adapters.js';
import { RetryQuote, CachedQuote } from './shipping/decorators.js';
import { ShippingService } from './shipping/ShippingService.js';

// --- Étape 1 · Factory Method + registre ---

const message = { to: 'alice@exemple.fr', body: 'Votre colis est parti', priority: 'normale' };

test('Factory : un canal par type, erreur si inconnu', () => {
  assert.equal(createChannel('email').send(message), '[EMAIL → alice@exemple.fr] Votre colis est parti');
  assert.equal(createChannel('sms').send(message), '[SMS → alice@exemple.fr] Votre colis est parti');
  assert.equal(createChannel('push').send(message), '[PUSH → alice@exemple.fr] Votre colis est parti');
  assert.throws(() => createChannel('pigeon'), /Canal inconnu : pigeon/);
});

test('Factory : le SMS est tronqué à 160 caractères', () => {
  const sent = createChannel('sms').send({ ...message, body: 'x'.repeat(200) });
  assert.equal(sent, `[SMS → alice@exemple.fr] ${'x'.repeat(160)}`);
});

test('Factory : la classe de base est abstraite', () => {
  assert.throws(() => new Channel().send(message), /méthode abstraite/);
});

test('Factory (OCP) : Slack ajouté sans modifier channels.js', async () => {
  assert.throws(() => createChannel('slack'), /Canal inconnu/); // pas encore installé
  await import('./notifications/slack.js');
  assert.equal(createChannel('slack').send({ to: 'logistique', body: 'Tarifs mis à jour' }),
    '[SLACK #logistique] Tarifs mis à jour');
  const src = readFileSync(new URL('./notifications/channels.js', import.meta.url), 'utf8');
  assert.equal(/slack/i.test(src), false);
});

test('Factory : une classe qui n’hérite pas de Channel est refusée', () => {
  class Pigeon { send() { return 'roucou'; } }
  assert.throws(() => registerChannel('pigeon', Pigeon), /doit hériter de Channel/);
  assert.throws(() => createChannel('pigeon'), /Canal inconnu/); // rien n'a été enregistré
});

// --- Étape 2 · Builder ---

const aliceBuilder = () => new MessageBuilder()
  .to('alice@exemple.fr')
  .template('Bonjour {{nom}}, votre colis part avec {{transporteur}}.')
  .with('nom', 'Alice')
  .with('transporteur', 'Colissimo');

test('Builder : un message valide, priorité normale par défaut', () => {
  assert.deepEqual(aliceBuilder().priority('haute').build(), {
    to: 'alice@exemple.fr', body: 'Bonjour Alice, votre colis part avec Colissimo.', priority: 'haute',
  });
  assert.equal(aliceBuilder().build().priority, 'normale');
});

test('Builder : chacune des 4 erreurs, détectées dans build()', () => {
  assert.throws(() => new MessageBuilder().template('Bonjour').build(), /Destinataire obligatoire/);
  assert.throws(() => new MessageBuilder().to('a@b.fr').build(), /Gabarit obligatoire/);
  assert.throws(() => aliceBuilder().priority('urgente').build(), /Priorité invalide : urgente/);
  assert.throws(() => new MessageBuilder().to('a@b.fr').template('Bonjour {{nom}}').build(),
    /Variable manquante : nom/);
});

test('Builder : les méthodes ne valident rien, seul build() le fait', () => {
  assert.doesNotThrow(() => new MessageBuilder().priority('urgente').to('').template(''));
});

test('Builder : le message construit est gelé (immuable)', () => {
  const message = aliceBuilder().build();
  assert.equal(Object.isFrozen(message), true);
  assert.throws(() => { message.body = 'piraté'; }, TypeError); // un module ES est en mode strict
});

// --- Étape 3a · Adapter ---

const parcel2kg = { weightKg: 2, zip: '75011' };

test('Adapter : Colissimo et DHL répondent au même contrat', async () => {
  assert.deepEqual(await new ColissimoAdapter(new ColissimoApi()).getQuote(parcel2kg),
    { carrier: 'Colissimo', price: 9.95, days: 2 });
  assert.deepEqual(await new DhlAdapter(new DhlClient()).getQuote(parcel2kg),
    { carrier: 'DHL', price: 11, days: 1 });
});

test('Adapter : une erreur Colissimo devient une promesse rejetée, comme chez DHL', async () => {
  await assert.rejects(new ColissimoAdapter(new ColissimoApi()).getQuote({ weightKg: 2, zip: 'abc' }),
    /Code postal invalide/);
});

// --- Étape 3b · Decorator ---

test('Decorator Retry : absorbe 2 pannes sur 3 essais', async () => {
  const client = new DhlClient({ failFirst: 2 });
  const quote = await new RetryQuote(new DhlAdapter(client), { attempts: 3 }).getQuote(parcel2kg);
  assert.equal(quote.price, 11);
  assert.equal(client.calls, 3);
});

test('Decorator Retry : abandonne après 3 échecs et relance la dernière erreur', async () => {
  const client = new DhlClient({ failFirst: 5 });
  await assert.rejects(new RetryQuote(new DhlAdapter(client)).getQuote(parcel2kg), /503/);
  assert.equal(client.calls, 3);
});

test('Decorator Cache : le 2e appel ne rappelle pas le transporteur', async () => {
  const client = new DhlClient();
  const cached = new CachedQuote(new DhlAdapter(client));
  const first = await cached.getQuote(parcel2kg);
  assert.deepEqual(await cached.getQuote(parcel2kg), first);
  assert.equal(client.calls, 1);
  await cached.getQuote({ weightKg: 3, zip: '75011' }); // autre poids : autre clé
  assert.equal(client.calls, 2);
});

test('Decorator Cache : le devis expire après ttlMs', async () => {
  let clock = 0;
  const client = new DhlClient();
  const cached = new CachedQuote(new DhlAdapter(client), { ttlMs: 1000, now: () => clock });
  await cached.getQuote(parcel2kg);
  clock = 999;
  await cached.getQuote(parcel2kg);
  assert.equal(client.calls, 1);
  clock = 1000;
  await cached.getQuote(parcel2kg);
  assert.equal(client.calls, 2);
});

test('Decorator Cache : une erreur n’est jamais mémorisée', async () => {
  const client = new DhlClient({ failFirst: 1 });
  const cached = new CachedQuote(new DhlAdapter(client));
  await assert.rejects(cached.getQuote(parcel2kg), /503/);
  assert.equal((await cached.getQuote(parcel2kg)).price, 11);
});

test('Decorator : composition cache(retry(dhl))', async () => {
  const client = new DhlClient({ failFirst: 1 });
  const dhl = new CachedQuote(new RetryQuote(new DhlAdapter(client)));
  assert.deepEqual(await dhl.getQuote(parcel2kg), { carrier: 'DHL', price: 11, days: 1 });
  assert.equal(client.calls, 2); // 1 panne absorbée par le retry
  await dhl.getQuote(parcel2kg);
  assert.equal(client.calls, 2); // servi par le cache
});

// --- Étape 4 · Facade ---

const colissimo = () => new ColissimoAdapter(new ColissimoApi());
const dhl = (options) => new DhlAdapter(new DhlClient(options));
const fixedQuote = (carrier, price, days) => ({ getQuote: async () => ({ carrier, price, days }) });

test('Facade : 2 kg → Colissimo, 10 kg → DHL', async () => {
  const shipping = new ShippingService([colissimo(), dhl()]);
  assert.equal((await shipping.bestQuote({ weightKg: 2, zip: '75011' })).carrier, 'Colissimo'); // 9.95 < 11
  assert.equal((await shipping.bestQuote({ weightKg: 10, zip: '75011' })).carrier, 'DHL');     // 23 < 29.95
});

test('Facade : le moins cher, puis le plus rapide ; un transporteur en panne est ignoré', async () => {
  const tie = new ShippingService([fixedQuote('Lent', 10, 3), fixedQuote('Rapide', 10, 1)]);
  assert.equal((await tie.bestQuote(parcel2kg)).carrier, 'Rapide');
  const withBroken = new ShippingService([dhl({ failFirst: 99 }), colissimo()]);
  assert.equal((await withBroken.bestQuote({ weightKg: 10, zip: '75011' })).carrier, 'Colissimo');
});

test('Facade : liste vide ou tous en panne → « Aucun transporteur disponible »', async () => {
  await assert.rejects(new ShippingService([]).bestQuote(parcel2kg), /Aucun transporteur disponible/);
  await assert.rejects(new ShippingService([dhl({ failFirst: 99 })]).bestQuote(parcel2kg),
    /Aucun transporteur disponible/);
});

test('Facade : les transporteurs sont interrogés en parallèle', async () => {
  let started = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const slow = (carrier, price) => ({ getQuote: async () => { started++; await gate; return { carrier, price, days: 1 }; } });
  const pending = new ShippingService([slow('A', 5), slow('B', 4)]).bestQuote(parcel2kg);
  assert.equal(started, 2); // les 2 appels sont partis avant qu'aucun ne réponde
  release();
  assert.equal((await pending).carrier, 'B');
});
