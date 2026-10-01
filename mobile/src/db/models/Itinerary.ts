import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class CachedItinerary extends Model {
  static table = 'cached_itineraries';

  @field('itinerary_id') itineraryId!: string;
  @field('title') title!: string;
  @field('total_cost') totalCost!: number;
  @field('scheduled_date') scheduledDate!: string;
}
