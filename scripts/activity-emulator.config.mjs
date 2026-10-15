import path from 'node:path';
const config = {test:{environment:'node',include:['scripts/client-activity-emulator.test.ts'],testTimeout:15000,hookTimeout:15000},resolve:{alias:{'@':path.resolve('src')}}};
export default config;
