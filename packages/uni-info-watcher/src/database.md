# database

## Heirarchical Queries

For fetching previous entity that would be updated at a particular blockHash, we need to traverse the parent hashes. As the same entity might be present on a different branch chain with different values. These branches occur in the frothy region and so a recursive query is done to get the blockHashes at this region.

Let the blockHash be `0xBlockHash` and blockNumber `1234`, then the heirarchical query is

```pgsql
WITH RECURSIVE cte_query AS
(
	SELECT
		block_hash,
		block_number,
		parent_hash,
		1 as depth
	FROM
		block_progress
	WHERE
		block_hash = '0xBlockHash'
	UNION ALL
		SELECT
			b.block_hash,
			b.block_number,
			b.parent_hash,
			c.depth + 1
		FROM
			block_progress b
		INNER JOIN
			cte_query c ON c.parent_hash = b.block_hash
		WHERE
			c.depth < 16
)
SELECT
	block_hash, block_number
FROM
	cte_query;
```

The second WHERE clause checks that the loop continues only till MAX_REORG_DEPTH `16` which specifies the frothy region.

The resulting blockHashes are then used to find the previous entity.
