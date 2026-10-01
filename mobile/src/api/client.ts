import axios from 'axios';

const API_BASE_URL = 'http://10.0.2.2:5000/api'; 

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

export interface ScheduleRequest {
  interests: string[];
  maxBudget: number;
  startTime: string;
  endTime: string;
  isSurprise?: boolean;
}

export const fetchSchedule = async (params: ScheduleRequest) => {
  const response = await api.post('/itinerary/generate', params);
  return response.data;
};
