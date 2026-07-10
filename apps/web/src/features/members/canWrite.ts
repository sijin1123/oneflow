/** Pure write-access predicate (Pass 76). role/archive → can-write.
 *  Alias-free so node --test can exercise the six-case matrix without a
 *  React tree or the '@/' resolver (v76.1 R1-⑤). Fail-closed while loading. */
export function canWriteFrom(
  myRole: string | undefined,
  archivedAt: string | null | undefined,
  loaded: boolean,
): boolean {
  if (!loaded) return false
  if (myRole !== 'owner' && myRole !== 'member') return false
  return archivedAt === null
}
