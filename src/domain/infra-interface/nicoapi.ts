import {Program} from "../model/program";

export interface NicoApi {
    getOnAirPrograms(): Promise<Program[]>;
}