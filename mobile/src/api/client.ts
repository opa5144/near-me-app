import axios from 'axios';
import Constants from 'expo-constants';

// Automatically extracts your computer's local Wi-Fi IP from Expo
const hostUri = Constants.expoConfig?.hostUri || Constants.manifest?.debuggerHost;
const ipAddress = hostUri ? hostUri.split(':')[0] : 'localhost';

const API_BASE_URL = `http://${ipAddress}:5000/api`; 

console.log('Connecting to Backend API at:', API_BASE_URL);

 

export const api = axios.create({
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

//signup 
export interface SignupRequest { //whats sent 
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

export interface SignupResponse { //whats given back
  message: string;
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
  };
}

export async function signupUser( //what is called in signup form 
  form: SignupRequest, 
): Promise<SignupResponse> {
  const response = await api.post<SignupResponse>(
      '/auth/signup',
      form,
    );

  return response.data;
}

//login
export interface LoginRequest{//whats sent
  email: string;
  password: string;
}
export interface LoginResponse{//whats given back
  message: string;
  user: SignupResponse['user'];
}
export async function loginUser(form: LoginRequest): Promise<LoginResponse>{//what is called in login form
  const response = await api.post<LoginResponse>(
    '/auth/login',
    form,
  );
  return response.data;
}