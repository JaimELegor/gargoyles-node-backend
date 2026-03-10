export interface FilterParam {
  value: number;
  min: number;
  max: number;
  step: number;
}

export interface FilterParams {
    [key: string]: FilterParam;
}

export interface FilterDef {
    name: string;
    description: string;
    icon?: string;
    version?: string;
    params: FilterParams;
    processFunc: string;
    shader?: string;
    tags: string[];
    thumbnail: string;
}

