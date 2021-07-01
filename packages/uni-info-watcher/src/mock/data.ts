import Chance from 'chance';

export interface Entity {
  blockNumber: number
  id: string
  [field: string]: any
}

export class Data {
  static _instance: Data;

  _entities: {[key: string]: Array<Entity>} = {
    bundles: []
  }

  _chance

  constructor () {
    this._chance = new Chance();
    this._generateData();
  }

  static getInstance (): Data {
    if (!this._instance) {
      this._instance = new Data();
    }
    return this._instance;
  }

  get entities (): {[key: string]: Array<Entity>} {
    return this._entities;
  }

  _generateData (): void {
    // Generate data for 3 blocks.
    Array.from(Array(3))
      .forEach((_, index) => {
        this._entities.bundles.push({
          blockNumber: index,
          id: '1',
          ethPriceUSD: this._chance.floating({ min: 0, fixed: 2 })
        });
      });
  }
}
