// Adapter : chaque transporteur a son API (non modifiable) ; on les ramène à NOTRE contrat unique :
//   getQuote({ weightKg, zip }) -> Promise<{ carrier, price, days }>   (price en euros, nombre)

export class ColissimoAdapter {
  constructor(api) {
    this.api = api; // ColissimoApi : synchrone, grammes, centimes
  }

  async getQuote({ weightKg, zip }) {
    const { prixCentimes, delaiJours } = this.api.tarif({ poidsGrammes: weightKg * 1000, codePostal: zip });
    return { carrier: 'Colissimo', price: prixCentimes / 100, days: delaiJours };
  }
}

export class DhlAdapter {
  constructor(client) {
    this.client = client; // DhlClient : asynchrone, kilos, montant en texte
  }

  async getQuote({ weightKg, zip }) {
    const { amount, transitDays } = await this.client.getRate(weightKg, zip);
    return { carrier: 'DHL', price: Number(amount), days: transitDays };
  }
}
