export class FromSingleton {
  private static instance: FromSingleton
  private _from: string | null = null

  private constructor() {}

  public static getInstance(): FromSingleton {
    if (!FromSingleton.instance) {
      FromSingleton.instance = new FromSingleton()
    }
    return FromSingleton.instance
  }

  get from(): string | null {
    return this._from
  }

  set from(value: string | null) {
    this._from = value
  }
}
