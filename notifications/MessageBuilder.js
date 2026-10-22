// Builder : construit un message { to, body, priority } pas à pas, avec un gabarit à variables {{nom}}.
// Les méthodes ne font que mémoriser (interface fluide : elles renvoient this) ;
// toute la validation a lieu UNE SEULE FOIS, dans build().
const PRIORITIES = ['basse', 'normale', 'haute'];
const VARIABLE = /\{\{(\w+)\}\}/g;

export class MessageBuilder {
  #to = null;
  #template = null;
  #values = new Map();
  #priority = 'normale';

  to(recipient) {
    this.#to = recipient;
    return this;
  }

  template(text) {
    this.#template = text;
    return this;
  }

  with(name, value) {
    this.#values.set(name, value);
    return this;
  }

  priority(level) {
    this.#priority = level;
    return this;
  }

  build() {
    if (!this.#to) throw new Error('Destinataire obligatoire');
    if (!this.#template) throw new Error('Gabarit obligatoire');
    if (!PRIORITIES.includes(this.#priority)) throw new Error(`Priorité invalide : ${this.#priority}`);
    for (const [, name] of this.#template.matchAll(VARIABLE)) {
      if (!this.#values.has(name)) throw new Error(`Variable manquante : ${name}`);
    }
    const body = this.#template.replace(VARIABLE, (_, name) => String(this.#values.get(name)));
    return Object.freeze({ to: this.#to, body, priority: this.#priority });
  }
}
