import { supabase } from '@/lib/db';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('employees')
            .select('legajo');

        if (error) throw error;

        const nums = (data || [])
            .map(r => parseInt(r.legajo, 10))
            .filter(n => Number.isFinite(n) && n > 0);

        const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;

        return Response.json({ nextLegajo: next });
    } catch (error) {
        console.error('Error fetching next legajo:', error);
        return Response.json({ error: 'Failed to get next legajo' }, { status: 500 });
    }
}
