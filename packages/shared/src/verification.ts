export type DriverRecord = {
  id: string;
  surname: string;
  fullName: string;
  status: string;
  photoUrl: string | null;
};

export type VerificationRequest = {
  id: string;
  surname: string;
};

export type VerificationResponse =
  | {
      verified: true;
      driver: DriverRecord;
    }
  | {
      verified: false;
      driver: null;
    };
