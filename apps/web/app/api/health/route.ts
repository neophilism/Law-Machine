export function GET() {
  return Response.json({ status: 'ok', mode: 'fixture', application: 'law-machine', simulationAvailable: false }, { headers: { 'Cache-Control': 'no-store' } });
}
