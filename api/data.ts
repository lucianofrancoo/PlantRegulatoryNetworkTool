import { getDataset } from '../server/dataStore';

export default async function handler(req: any, res: any) {
  try {
    const dataset = await getDataset();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(dataset);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load dataset' });
  }
}
