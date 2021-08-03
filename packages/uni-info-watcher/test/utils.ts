import { Client as UniClient } from '@vulcanize/uni-watcher';

export const watchEvent = async (uniClient: UniClient, eventType: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const subscription = await uniClient.watchEvents((value: any) => {
          if (value.event.__typename === eventType) {
            if (subscription) {
              subscription.unsubscribe();
            }
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    })();
  });
};
