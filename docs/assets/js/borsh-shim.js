import borsh from 'borsh-original';  // import the original borsh using the alias
export const serialize = borsh.serialize;
export const deserialize = borsh.deserialize;
export const deserializeUnchecked = borsh.deserializeUnchecked;