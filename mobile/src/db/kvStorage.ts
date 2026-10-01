import { MMKV } from 'react-native-mmkv';

export const storage = new MMKV();

export const savePreferences = (interests: string[], maxBudget: number) => {
  storage.set('user.interests', JSON.stringify(interests));
  storage.set('user.maxBudget', maxBudget);
};

export const getPreferences = () => {
  const rawInterests = storage.getString('user.interests');
  const maxBudget = storage.getNumber('user.maxBudget') ?? 100;
  return {
    interests: rawInterests ? (JSON.parse(rawInterests) as string[]) : [],
    maxBudget,
  };
};
