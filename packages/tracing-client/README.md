# Tracing Client

```bash
npx ts-node src/cli/get-tx-trace.ts --txHash 0xa58ec012f8b6d5baac684b9939287866deffa3806f4c8252a190f264cc07b872

npx ts-node src/cli/get-tx-trace.ts --txHash 0xa58ec012f8b6d5baac684b9939287866deffa3806f4c8252a190f264cc07b872 --tracer callTracer

npx ts-node src/cli/get-tx-trace.ts --txHash 0xa58ec012f8b6d5baac684b9939287866deffa3806f4c8252a190f264cc07b872 --tracerFile src/tracers/call_tracer.js

npx ts-node src/cli/get-tx-trace.ts --txHash 0xa58ec012f8b6d5baac684b9939287866deffa3806f4c8252a190f264cc07b872 --tracerFile src/tracers/address_tracer.js

npx ts-node src/cli/get-call-trace.ts --block 0x66bbe015dec07f55bc916dff724a962bca067fa0fcdd42eb211474ad609f87be  --txFile test/tx/rinkeby-test.json --providerUrl http://rinkeby-testing.vdb.to:8545
```
