import { createContext, useContext } from 'react';
import { api, type Api } from './index';

export const ApiContext = createContext<Api>(api);

export function useApi(): Api {
  return useContext(ApiContext);
}
