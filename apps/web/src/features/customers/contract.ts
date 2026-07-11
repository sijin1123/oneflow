import type { components } from '@shared/api-types'

import type { Customer, CustomerList } from './types'

type Schemas = components['schemas']
type Assert<T extends true> = T
type Extends<A, B> = A extends B ? true : false

export type _CustomerMatches = Assert<Extends<Customer, Schemas['CustomerRead']>>
export type _CustomerListMatches = Assert<Extends<CustomerList, Schemas['CustomerList']>>
