import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'cached_itineraries',
      columns: [
        { name: 'itinerary_id', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'total_cost', type: 'number' },
        { name: 'scheduled_date', type: 'string' },
      ],
    }),
  ],
});
