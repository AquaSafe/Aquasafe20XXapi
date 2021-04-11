export interface Response {
    auth: boolean,
    msg?: string,
    token?: string,
    results?: Array<object>
}

export interface Sample {
    name: string,
    pH: number,
    hardness: number,
    color: number,
    location:number,
    id ?: number

}
