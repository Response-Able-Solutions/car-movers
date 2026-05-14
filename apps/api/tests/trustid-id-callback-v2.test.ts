import test from 'node:test';
import { strict as assert } from 'node:assert';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { createHandler } from '../api/trustid-id-callback-v2.ts';
import {
  idCheckBoard,
  idCheckSignalStatusValues,
  TrustidApiError,
} from '@car-movers/shared/trustid-v2';
import type {
  TrustidClient,
  MondayTrustidClient,
  IdCheckItem,
  WriteIdCheckOutcomePayload,
  RetrieveDocumentContainerResponse,
} from '@car-movers/shared/trustid-v2';

// -----------------------------------------------------------------------------
// Real captured TrustID sandbox container (container_id 67331d76-6373-47b1-83de-4c220a17c22a)
// — canonical real-shape fixture. Verified outcome on this container:
//   Liveness    = Pass   (LivenessTestResult === 1)
//   Face Match  = Fail   (Value=false, Notes="Failed Test")
//   Address     = Fail   (DetailedResult="No Match")
//   Overall     = Fail
// -----------------------------------------------------------------------------
export const realCapturedContainer = JSON.parse(String.raw`
{
  "AccessDenied": false,
  "CallbackId": null,
  "Locked": false,
  "Message": "Operation executed successfully.",
  "MfaCodeRequired": false,
  "NewPasswordRequired": false,
  "SessionExpired": false,
  "Success": true,
  "VpeUnreachable": false,
  "Container": {
    "AccessLock": {
      "AnonymousSessionId": null,
      "Locked": false,
      "Timestamp": "/Date(1778247588090+0100)/",
      "UserDisplay": null,
      "UserId": null
    },
    "AddressHistory": [],
    "ApplicantPhotoImage": {
      "ContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
      "CreatedAt": "/Date(1778249213140+0100)/",
      "CropArea": {
        "BottomLeft": {
          "x": 0,
          "y": 0
        },
        "BottomRight": {
          "x": 0,
          "y": 0
        },
        "TopLeft": {
          "x": 0,
          "y": 0
        },
        "TopRight": {
          "x": 0,
          "y": 0
        }
      },
      "CurrentHeight": 0,
      "CurrentSize": 0,
      "CurrentWidth": 0,
      "FileType": 1,
      "Filename": null,
      "Id": "53fb3fc6-748e-431c-bf80-20d2e5a6214c",
      "ImageSourceId": "d3aea84a-9f35-461b-8f5a-10b33ee94abf",
      "ImageType": 1,
      "OriginalHeight": 0,
      "OriginalSize": 0,
      "OriginalWidth": 0,
      "Rotation": 0,
      "TimeTakenToProcess": 0,
      "TimeTakenToUpload": 0
    },
    "ApplicationFlexibleFieldList": [
      {
        "m_Item1": {
          "BranchId": null,
          "CreationDate": "/Date(-62135596800000+0000)/",
          "DataRange": "450",
          "DataType": 1,
          "DefaultValue": null,
          "DisplayName": "Guest Name",
          "EntityId": null,
          "FieldOrderIndex": 100,
          "Flags": 3,
          "FlexibleFieldId": "00000000-0000-0000-0000-000000000000",
          "HelpText": "Name of person sent a guest link.",
          "Id": "00000000-0000-0000-0000-000000000000",
          "IsActive": false,
          "IsEnabled": true,
          "IsGlobal": true,
          "IsValidationField": false,
          "LastModifield": "/Date(-62135596800000+0000)/",
          "Mandatory": false,
          "Name": "__SYS_GuestName",
          "ValidationFailValue": null,
          "ValidationPassValue": null,
          "ValidationWarningValue": null
        },
        "m_Item2": {
          "BehaviourFlagsDup": 256,
          "DataRangeDup": null,
          "DefaultValueDup": null,
          "DocumentContainerId": "00000000-0000-0000-0000-000000000000",
          "FieldOrderIndexDup": 0,
          "FieldValueDate": null,
          "FieldValueDecimal": null,
          "FieldValueInt": null,
          "FieldValueString": "Lui Fail",
          "FlexibleFieldDataTypeIdDup": 1,
          "FlexibleFieldDisplayNameDup": "Guest Name",
          "FlexibleFieldId": "00000000-0000-0000-0000-000000000000",
          "FlexibleFieldNameDup": "__SYS_GuestName",
          "FlexibleFieldVersionId": "00000000-0000-0000-0000-000000000000",
          "HelpTextDup": null,
          "MandatoryDup": false,
          "MandatoryIfValueListORDup": null,
          "Template": {
            "BranchId": null,
            "CreationDate": "/Date(-62135596800000+0000)/",
            "DataRange": "450",
            "DataType": 1,
            "DefaultValue": null,
            "DisplayName": "Guest Name",
            "EntityId": null,
            "FieldOrderIndex": 100,
            "Flags": 3,
            "FlexibleFieldId": "00000000-0000-0000-0000-000000000000",
            "HelpText": "Name of person sent a guest link.",
            "Id": "00000000-0000-0000-0000-000000000000",
            "IsActive": false,
            "IsEnabled": true,
            "IsGlobal": true,
            "IsValidationField": false,
            "LastModifield": "/Date(-62135596800000+0000)/",
            "Mandatory": false,
            "Name": "__SYS_GuestName",
            "ValidationFailValue": null,
            "ValidationPassValue": null,
            "ValidationWarningValue": null
          },
          "ValidationStatus": null
        }
      },
      {
        "m_Item1": {
          "BranchId": null,
          "CreationDate": "/Date(-62135596800000+0000)/",
          "DataRange": "320",
          "DataType": 1,
          "DefaultValue": null,
          "DisplayName": "Guest Email Address",
          "EntityId": null,
          "FieldOrderIndex": 101,
          "Flags": 3,
          "FlexibleFieldId": "00000000-0000-0000-0000-000000000000",
          "HelpText": "Email address of person sent a guest link.",
          "Id": "00000000-0000-0000-0000-000000000000",
          "IsActive": false,
          "IsEnabled": true,
          "IsGlobal": true,
          "IsValidationField": false,
          "LastModifield": "/Date(-62135596800000+0000)/",
          "Mandatory": false,
          "Name": "__SYS_GuestEmail",
          "ValidationFailValue": null,
          "ValidationPassValue": null,
          "ValidationWarningValue": null
        },
        "m_Item2": {
          "BehaviourFlagsDup": 256,
          "DataRangeDup": null,
          "DefaultValueDup": null,
          "DocumentContainerId": "00000000-0000-0000-0000-000000000000",
          "FieldOrderIndexDup": 0,
          "FieldValueDate": null,
          "FieldValueDecimal": null,
          "FieldValueInt": null,
          "FieldValueString": "tech.luiholl@gmail.com",
          "FlexibleFieldDataTypeIdDup": 1,
          "FlexibleFieldDisplayNameDup": "Guest Email Address",
          "FlexibleFieldId": "00000000-0000-0000-0000-000000000000",
          "FlexibleFieldNameDup": "__SYS_GuestEmail",
          "FlexibleFieldVersionId": "00000000-0000-0000-0000-000000000000",
          "HelpTextDup": null,
          "MandatoryDup": false,
          "MandatoryIfValueListORDup": null,
          "Template": {
            "BranchId": null,
            "CreationDate": "/Date(-62135596800000+0000)/",
            "DataRange": "320",
            "DataType": 1,
            "DefaultValue": null,
            "DisplayName": "Guest Email Address",
            "EntityId": null,
            "FieldOrderIndex": 101,
            "Flags": 3,
            "FlexibleFieldId": "00000000-0000-0000-0000-000000000000",
            "HelpText": "Email address of person sent a guest link.",
            "Id": "00000000-0000-0000-0000-000000000000",
            "IsActive": false,
            "IsEnabled": true,
            "IsGlobal": true,
            "IsValidationField": false,
            "LastModifield": "/Date(-62135596800000+0000)/",
            "Mandatory": false,
            "Name": "__SYS_GuestEmail",
            "ValidationFailValue": null,
            "ValidationPassValue": null,
            "ValidationWarningValue": null
          },
          "ValidationStatus": null
        }
      }
    ],
    "ApplicationRead": true,
    "BranchId": "853b0ac6-bb1a-4f31-a8b0-d5587000f218",
    "BranchName": "Car Movers Dev - Digital DBS Basic",
    "ClientAppId": 2200102800007,
    "CreatedAt": "/Date(1778245452110+0100)/",
    "DbsCheckInitiation": {
      "State": 1
    },
    "DbsStatus": null,
    "DocumentContainerFieldList": [
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": "GBR",
        "Id": 145824,
        "Name": "Address_CountryCode",
        "Source": 1
      },
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": "SW18 1NY",
        "Id": 145823,
        "Name": "Address_Postcode",
        "Source": 1
      },
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": "Flat A",
        "Id": 145819,
        "Name": "Address1",
        "Source": 1
      },
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": "88 Cromford Road",
        "Id": 145820,
        "Name": "Address2",
        "Source": 1
      },
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": null,
        "Id": 145825,
        "Name": "Address3",
        "Source": 1
      },
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": "London",
        "Id": 145821,
        "Name": "Address4",
        "Source": 1
      },
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": "Greater London",
        "Id": 145822,
        "Name": "Address5",
        "Source": 1
      },
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": null,
        "Id": 145826,
        "Name": "Address6",
        "Source": 1
      },
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": "2902248977",
        "Id": 145806,
        "Name": "ClientApplicationReference",
        "Source": 0
      },
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": "Fail",
        "Id": 145827,
        "Name": "DBSBasicIdentityProfile",
        "Source": 0
      },
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": "4dff7dd3-867c-4cb5-aef5-bb99b6fd1ab1",
        "Id": 145818,
        "Name": "FacetecReference",
        "Source": 0
      },
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": "32",
        "Id": 145807,
        "Name": "GuestDigitalIdentificationScheme",
        "Source": 0
      },
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": "{\"globaltransactionid\": \"d5bf449842114c01a3522226dc6cebfa\",\"references\":[\"67331d76-6373-47b1-83de-4c220a17c22a\"],\"outputresults\": [{\"system\":\"IDU\",\"status\":200,\"systemresponse\":{\"summary\":{\"status\":true,\"id\":\"1111692607\",\"ikey\":\"1778250998\",\"reference\":\"67331d76-6373-47b1-83de-4c220a17c22a\",\"scorecard\":\"Minimum 1 Address Match\",\"smartscore\":0,\"resulttext\":\"REFER\",\"profileurl\":\"https://sandbox.idu.tracesmart.co.uk/?page=save&id=1111692607&ikey=1778250998\",\"credits\":15071,\"referreasons\":[\"Address\"]},\"address\":{\"uklexid\":\"0\",\"forename\":\"LUI\",\"surname\":\"FAIL\",\"dob\":\"1753-01-01\",\"forenameappended\":false,\"middlenameappended\":false,\"dobappended\":false,\"telephone\":\"Unavailable\",\"goneaway\":\"N\",\"property\":[{\"type\":\"Flat\",\"tenure\":\"L\",\"date\":\"1997-02-21\",\"price\":\"137500\",\"silhouette\":\"B11\"}],\"addressfound\":true,\"cleanedaddress\":{\"address1\":\"FLAT A\",\"address2\":\"88 CROMFORD ROAD\",\"address3\":\"LONDON\",\"postcode\":\"SW18 1NY\"}},\"creditactive\":{\"insightaccounts\":-5,\"insightlenders\":-5,\"caislenders\":0}}}]}",
        "Id": 145869,
        "Name": "LNHubQueryResultData_1 IDV Match_credit",
        "Source": 6
      },
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": "{\"globaltransactionid\": \"ae64132bd08c4215bc3e080ea6b58cf0\",\"references\":[\"67331d76-6373-47b1-83de-4c220a17c22a\"],\"outputresults\": [{\"system\":\"IDU\",\"status\":200,\"systemresponse\":{\"summary\":{\"status\":true,\"id\":\"1111692607\",\"ikey\":\"1778250998\",\"reference\":\"67331d76-6373-47b1-83de-4c220a17c22a\",\"scorecard\":\"Minimum 1 Address Match\",\"smartscore\":0,\"resulttext\":\"REFER\",\"profileurl\":\"https://sandbox.idu.tracesmart.co.uk/?page=save&id=1111692607&ikey=1778250998\",\"credits\":15075,\"referreasons\":[\"Address\"]},\"address\":{\"uklexid\":\"0\",\"forename\":\"LUI\",\"surname\":\"FAIL\",\"dob\":\"1753-01-01\",\"forenameappended\":false,\"middlenameappended\":false,\"dobappended\":false,\"telephone\":\"Unavailable\",\"goneaway\":\"N\",\"property\":[{\"type\":\"Flat\",\"tenure\":\"L\",\"date\":\"1997-02-21\",\"price\":\"137500\",\"silhouette\":\"B11\"}],\"addressfound\":true,\"cleanedaddress\":{\"address1\":\"FLAT A\",\"address2\":\"88 CROMFORD ROAD\",\"address3\":\"LONDON\",\"postcode\":\"SW18 1NY\"}}}}]}",
        "Id": 145868,
        "Name": "LNHubQueryResultData_1 IDV Match_public",
        "Source": 6
      },
      {
        "DescriptionText": null,
        "DisplayName": null,
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "FieldValueDate": null,
        "FieldValueString": "79743e2160e24dae863b851ec7a8f520;4qiJDRrmxdlUiESLnuUKuR6uCik1NwOpJxxCiV3TBueybpqIbhn6fSoDItmBsRP1zO9fGTSIwBkYmRa3UFwl1IaVAm7y8ost94SfNypcZ7B+EgAT4gszWxS4SB63md6TQKph+HL6RTscJ5KYSHiwj6OBFVIHxziE65EdtTCDl0NN8izg7Pq7wF4k8VlgImMQE+vagwYLiHi9Nxjq/iu2JUREKkB5xsGhw6cUb69O^Mzk5ZDRmZGUwMGQzNGMyNg==;1778254597687",
        "Id": 145867,
        "Name": "LNHubSessionData",
        "Source": 6
      }
    ],
    "DocumentContainerValidationList": [
      {
        "ActionsText": null,
        "DescriptionText": null,
        "DetailedResult": "",
        "DisplayName": "DBS Basic Digital Identity Permitted Document Verification",
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "Id": 18607,
        "InformationText": null,
        "Name": "DBSBasicDigitalIdentityPermittedDocumentVerification",
        "OutcomeCommentText": null,
        "RefFieldNames": null,
        "ValidationOutcome": 3
      },
      {
        "ActionsText": null,
        "DescriptionText": null,
        "DetailedResult": "",
        "DisplayName": "DBS Basic Digital Identity Document Validation Verification",
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "Id": 18608,
        "InformationText": null,
        "Name": "DBSBasicDigitalIdentityDocumentValidationVerification",
        "OutcomeCommentText": null,
        "RefFieldNames": null,
        "ValidationOutcome": 5
      },
      {
        "ActionsText": null,
        "DescriptionText": null,
        "DetailedResult": "",
        "DisplayName": "DBS Basic Digital Identity Identity Fraud Verification",
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "Id": 18609,
        "InformationText": null,
        "Name": "DBSBasicDigitalIdentityIdentityFraudVerification",
        "OutcomeCommentText": null,
        "RefFieldNames": null,
        "ValidationOutcome": 5
      },
      {
        "ActionsText": null,
        "DescriptionText": null,
        "DetailedResult": "",
        "DisplayName": "DBS Basic Digital Identity Face Match Verification",
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "Id": 18610,
        "InformationText": null,
        "Name": "DBSBasicDigitalIdentityFaceMatchVerification",
        "OutcomeCommentText": null,
        "RefFieldNames": null,
        "ValidationOutcome": 5
      },
      {
        "ActionsText": null,
        "DescriptionText": null,
        "DetailedResult": "",
        "DisplayName": "DBS Basic Digital Identity Liveness Verification",
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "Id": 18611,
        "InformationText": null,
        "Name": "DBSBasicDigitalIdentityLivenessVerification",
        "OutcomeCommentText": null,
        "RefFieldNames": null,
        "ValidationOutcome": 4
      },
      {
        "ActionsText": null,
        "DescriptionText": null,
        "DetailedResult": "",
        "DisplayName": "DBS Basic Identity Verification Check",
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "Id": 18612,
        "InformationText": null,
        "Name": "DBSBasicIdentityVerificationCheck",
        "OutcomeCommentText": null,
        "RefFieldNames": null,
        "ValidationOutcome": 3
      },
      {
        "ActionsText": null,
        "DescriptionText": null,
        "DetailedResult": "No Match",
        "DisplayName": "Address Verification",
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "Id": 18621,
        "InformationText": null,
        "Name": "AddressVerification",
        "OutcomeCommentText": null,
        "RefFieldNames": null,
        "ValidationOutcome": 1025
      },
      {
        "ActionsText": null,
        "DescriptionText": null,
        "DetailedResult": "No Match",
        "DisplayName": "Kyc Aml Check",
        "DocumentContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "Id": 18622,
        "InformationText": null,
        "Name": "KycAmlCheck",
        "OutcomeCommentText": null,
        "RefFieldNames": null,
        "ValidationOutcome": 1025
      }
    ],
    "DocumentSource": 4,
    "DocumentStorageType": 3,
    "Documents": [
      {
        "AspectRatio": 0.7499315142631531,
        "Audited": true,
        "AuditedByUser": "buzz, (TrustID Reviewers)",
        "AuditorMessage": null,
        "AuditorStatus": 3,
        "Blacklisted": null,
        "BlacklistedAt": null,
        "BranchName": "Car Movers Dev - Digital DBS Basic",
        "CompatibilityDocumentSubTypeCode": null,
        "CompatibilityDocumentTypeCode": null,
        "CompatibilityIssuingCountryCode": null,
        "CompatibilityNationalityCode": null,
        "ContactlessChipReadState": null,
        "ContainerId": "67331d76-6373-47b1-83de-4c220a17c22a",
        "ContinuedManually": false,
        "CreatedAt": "/Date(1778249177220+0100)/",
        "CustomFieldDictionary": [],
        "CustomFieldKeys": [],
        "DetectedOrientation": 0,
        "DocumentCompleted": false,
        "DocumentConfiguration": {
          "DisableExpiredEUDocumentsFailure": true,
          "DisableExpiredNonEuDocumentsFailure": true
        },
        "DocumentFields": [
          {
            "DataType": 0,
            "DescriptionText": null,
            "DisplayName": "Surname",
            "DocumentId": "5bef721d-39da-44e1-b980-b12c1c4e464a",
            "FieldValueDate": null,
            "FieldValueString": "Lui Fail",
            "Id": 53433,
            "ImageType": null,
            "Name": "UNK Surname",
            "RegionCoordinates": null,
            "Reliability": 0,
            "SourceId": 0
          }
        ],
        "DocumentId": "5bef721d-39da-44e1-b980-b12c1c4e464a",
        "DocumentName": "Passport",
        "DocumentResultsSummary": [
          {
            "ErrorMessage": null,
            "Name": "Photo Matches Applicant (TrustId)",
            "Value": false,
            "ValueUndefined": false
          },
          {
            "ErrorMessage": null,
            "Name": "General Document Assessments",
            "Value": false,
            "ValueUndefined": false
          },
          {
            "ErrorMessage": null,
            "Name": "MRZ Validations",
            "Value": false,
            "ValueUndefined": false
          },
          {
            "ErrorMessage": null,
            "Name": "Missing field",
            "Value": false,
            "ValueUndefined": false
          },
          {
            "ErrorMessage": null,
            "Name": "Amberhill Check",
            "Value": true,
            "ValueUndefined": false
          }
        ],
        "DocumentSubType": {
          "DocumentType": 0,
          "Id": "0",
          "Mrz": "",
          "Name": "None",
          "RewriteDocumentNumber": 0,
          "RewriteDocumentType": 0
        },
        "DocumentType": 0,
        "DocumentValidations": [
          {
            "ActionsText": null,
            "DescriptionText": null,
            "DisplayName": "PhotoMatchTrustId Software Valid",
            "DocumentId": "5bef721d-39da-44e1-b980-b12c1c4e464a",
            "Id": 40331,
            "ImageType": null,
            "InformationText": null,
            "Name": "PhotoMatchTrustId Software Valid",
            "OutcomeCommentText": null,
            "RefFieldNames": null,
            "RegionCoordinates": null,
            "Result": 0
          },
          {
            "ActionsText": null,
            "DescriptionText": null,
            "DisplayName": "PhotoMatchTrustId Auditor Valid",
            "DocumentId": "5bef721d-39da-44e1-b980-b12c1c4e464a",
            "Id": 40342,
            "ImageType": 999,
            "InformationText": null,
            "Name": "PhotoMatchTrustId Auditor Valid",
            "OutcomeCommentText": null,
            "RefFieldNames": null,
            "RegionCoordinates": null,
            "Result": 3
          }
        ],
        "DocumentVersion": {
          "AllowIncorrectExtendedDocumentNumber": false,
          "ChipFields": null,
          "ChipLocked": false,
          "ChipValidationFields": [
            55
          ],
          "Country": {
            "Alias1": "Great Britain",
            "Alias2": "Britain",
            "Alias3": "England",
            "AltMrz": null,
            "EU": true,
            "Mrz": "GBR",
            "Name": "United Kingdom",
            "Nationality": null,
            "UK": true
          },
          "DateFormat": 0,
          "DocumentSubType": null,
          "DocumentType": 0,
          "Features": [],
          "Id": "2380df72-ac58-4147-abdd-2f57801eaa84",
          "Images": [],
          "Laminated": false,
          "MRZFields": [],
          "Mrz": true,
          "MrzCharacters": 44,
          "MrzLines": 2,
          "Name": "UK Passport",
          "RFID": true,
          "ValidityRules": null,
          "Year": null
        },
        "DrivingLicenceCategory": null,
        "Editable": true,
        "ExpiryNotification": false,
        "ExternalServices": [
          {
            "CallerId": "e572d612-57b9-4072-a7bc-5a059a8f85eb",
            "ErrorMessage": null,
            "ID": "amberhill",
            "Match": false,
            "MatchedProperties": [
              {
                "Key": "document_number",
                "Value": ""
              },
              {
                "Key": "document_type",
                "Value": "P"
              },
              {
                "Key": "issuing_country",
                "Value": "GBR"
              },
              {
                "Key": "firstname",
                "Value": ""
              },
              {
                "Key": "middlename",
                "Value": ""
              },
              {
                "Key": "lastname",
                "Value": "Lui Fail"
              },
              {
                "Key": "gender",
                "Value": ""
              },
              {
                "Key": "date_of_birth",
                "Value": "1753-01-01"
              },
              {
                "Key": "expiry_date",
                "Value": "1753-01-01"
              }
            ],
            "Name": "Amberhill Check",
            "ServiceCallPending": false,
            "ServiceCalled": true,
            "Success": true,
            "Timestamp": "/Date(1778249956387+0100)/"
          }
        ],
        "ExternalServicesQueried": true,
        "FeedbackFace": null,
        "FeedbackFeatures": [],
        "FeedbackHasMrz": true,
        "FeedbackPersonMatches": null,
        "FeedbackRFIDImageMatches": null,
        "FeedbackUV": null,
        "FeedbackUVPattern": null,
        "Font": null,
        "FontAlignment": null,
        "FontHeight": null,
        "Forwarded": false,
        "GeneralDocumentProperties": [
          {
            "ErrorMessage": null,
            "Name": "Photo Matches Applicant (TrustId)",
            "Value": false,
            "ValueUndefined": false
          },
          {
            "ErrorMessage": null,
            "Name": "Document details complete",
            "Value": false,
            "ValueUndefined": false
          },
          {
            "ErrorMessage": null,
            "Name": "Amberhill Check",
            "Value": true,
            "ValueUndefined": false
          }
        ],
        "HasError": false,
        "HighRiskCountry": null,
        "Images": [
          {
            "ContainerId": null,
            "CreatedAt": "/Date(1778249178303+0100)/",
            "CropArea": {
              "BottomLeft": {
                "x": 0,
                "y": 0
              },
              "BottomRight": {
                "x": 0,
                "y": 0
              },
              "TopLeft": {
                "x": 0,
                "y": 0
              },
              "TopRight": {
                "x": 0,
                "y": 0
              }
            },
            "CurrentHeight": 3651,
            "CurrentSize": 1556813,
            "CurrentWidth": 2738,
            "DocumentId": "5bef721d-39da-44e1-b980-b12c1c4e464a",
            "FileType": 1,
            "Filename": null,
            "Id": "a6c679a0-5df2-4485-8029-98f71f4187cf",
            "ImageSourceId": null,
            "ImageType": 60,
            "OriginalHeight": 4032,
            "OriginalSize": 2110964,
            "OriginalWidth": 3024,
            "Rotation": 0,
            "TimeTakenToProcess": 559,
            "TimeTakenToUpload": 0
          },
          {
            "ContainerId": null,
            "CreatedAt": "/Date(1778249323557+0100)/",
            "CropArea": {
              "BottomLeft": {
                "x": 0,
                "y": 0
              },
              "BottomRight": {
                "x": 0,
                "y": 0
              },
              "TopLeft": {
                "x": 0,
                "y": 0
              },
              "TopRight": {
                "x": 0,
                "y": 0
              }
            },
            "CurrentHeight": 3651,
            "CurrentSize": 1556813,
            "CurrentWidth": 2738,
            "DocumentId": "5bef721d-39da-44e1-b980-b12c1c4e464a",
            "FileType": 1,
            "Filename": null,
            "Id": "43c5f4e1-bfe5-4081-b8df-70669c692495",
            "ImageSourceId": "a6c679a0-5df2-4485-8029-98f71f4187cf",
            "ImageType": 2,
            "OriginalHeight": 3651,
            "OriginalSize": 1556813,
            "OriginalWidth": 2738,
            "Rotation": 0,
            "TimeTakenToProcess": 0,
            "TimeTakenToUpload": 0
          }
        ],
        "IsBiometric": true,
        "IssuingAuthority": null,
        "IssuingCountry": {
          "Alias1": "Great Britain",
          "Alias2": "Britain",
          "Alias3": "England",
          "AltMrz": null,
          "EU": true,
          "Mrz": "GBR",
          "Name": "United Kingdom",
          "Nationality": null,
          "UK": true
        },
        "KDB": true,
        "Locked": true,
        "MRZCorrected": false,
        "MRZCorrectionProvided": true,
        "MandatoryDocumentFieldsFlag": 508,
        "MaxAgeFailed": null,
        "MinAgeFailed": null,
        "MissingFieldsProperties": [
          {
            "ErrorMessage": null,
            "Name": "Nationality",
            "Value": false,
            "ValueUndefined": false
          },
          {
            "ErrorMessage": null,
            "Name": "Date of birth",
            "Value": false,
            "ValueUndefined": false
          },
          {
            "ErrorMessage": null,
            "Name": "Expiry date",
            "Value": false,
            "ValueUndefined": true
          }
        ],
        "Mrz": "",
        "MrzCharacterCount": null,
        "MrzImageType": 2,
        "MrzLineCount": null,
        "MrzSameLength": null,
        "MrzValidationProperties": [
          {
            "ErrorMessage": null,
            "Name": "Valid MRZ codeline length",
            "Value": false,
            "ValueUndefined": false
          },
          {
            "ErrorMessage": null,
            "Name": "All characters valid",
            "Value": false,
            "ValueUndefined": false
          }
        ],
        "Nationality": null,
        "NoInitialFaceImage": true,
        "Notes": "Failed Test",
        "OcrDataApplied": true,
        "OcrFieldData": [],
        "OcrType": 5,
        "OperatorMessage": "",
        "OperatorStatus": 2,
        "OptionalDocumentFieldsFlag": 1539,
        "OriginalMrz": null,
        "PartiallyRecognised": false,
        "RFIDFailed": false,
        "ReadingAttemptsCount": 2,
        "RfidMrz": "",
        "RuleDenied": false,
        "ScanCounter": 1,
        "ScannedAt": "/Date(1778249177220+0100)/",
        "ScannerType": "CLOUD",
        "SeenBeforeDocumentContainerId": null,
        "SeenBeforeDocumentId": null,
        "SuccessfullyRead": false,
        "SupportingDocumentName": null,
        "SystemId": 1,
        "Unrecognised": false,
        "UpdatedAt": "/Date(1778251001873+0100)/",
        "ValidFrom": "/Date(-6847804800000+0000)/",
        "ValidLength": false,
        "VpeDeviceId": "dac2dbe8-1ddb-4bb3-97c9-fd47b86f613d",
        "VpeName": "TrustID Sandbox",
        "WizardCompleted": true,
        "WorkflowFlags": 0
      }
    ],
    "EntityId": "853b0ac6-bb1a-4f31-a8b0-d5587000f218",
    "Fullname": "Lui Fail",
    "Id": "67331d76-6373-47b1-83de-4c220a17c22a",
    "IsFullCheck": false,
    "JourneyId": null,
    "LivenessTestCount": 2,
    "LivenessTestResult": 1,
    "LivenessTestResultAuto": 1,
    "OrganisationId": "0cbc07a0-81e5-4f57-b6c5-11b78656715d",
    "OrganisationName": "Car Movers Dev",
    "OverallStatus": 1,
    "ProcessExpiryTimeUtc": "/Date(1778252948200)/",
    "ReferralHistory": [
      {
        "CompletedAt": "/Date(1778250968341+0100)/",
        "ReferralType": 1,
        "ReferredAt": "/Date(1778249348183+0100)/",
        "ReferredBy": {
          "DisplayName": "api_car_movers_dev, (Car Movers Dev - Digital DBS Basic)",
          "UserId": "bc65c7ad-87a9-4f99-bffc-11613404fe94"
        },
        "ReferredTo": {
          "DisplayName": "buzz, (TrustID Reviewers)",
          "UserId": "29f2019e-d8c8-42b5-8e5f-a93abd59c17b"
        }
      }
    ],
    "ReferralType": null,
    "Referred": false,
    "ReferredAt": null,
    "ReferredFrom": null,
    "ReviewApplicationInstigatingUser": null,
    "ReviewApplicationState": null,
    "ScannedByUser": "api_car_movers_dev, (Car Movers Dev - Digital DBS Basic)",
    "Synchronised": false,
    "SystemId": 1,
    "TotalAlerts": null,
    "TtaImport": null,
    "UpdatedAt": "/Date(1778251001890+0100)/",
    "UserId": "bc65c7ad-87a9-4f99-bffc-11613404fe94",
    "VpeDeviceId": "dac2dbe8-1ddb-4bb3-97c9-fd47b86f613d",
    "VpeName": "TrustID Sandbox",
    "VpeType": 18,
    "WorkflowType": 1
  }
}
`);


// -----------------------------------------------------------------------------
// Test infrastructure
// -----------------------------------------------------------------------------

const fixedNow = () => new Date('2026-05-15T10:00:00Z');

function idCheckItem(overrides: Partial<IdCheckItem> = {}): IdCheckItem {
  return {
    itemId: 'item-1',
    applicantName: 'Jane Doe',
    applicantEmail: 'jane@example.test',
    status: null,
    guestLinkUrl: null,
    trustIdContainerId: null,
    lastUpdatedAt: null,
    summary: null,
    error: null,
    ...overrides,
  };
}

type MondayWriteCall = { itemId: string; payload: WriteIdCheckOutcomePayload };

function fakeMonday(item: IdCheckItem): {
  client: MondayTrustidClient;
  writes: MondayWriteCall[];
  fetches: string[];
} {
  const writes: MondayWriteCall[] = [];
  const fetches: string[] = [];
  const client: MondayTrustidClient = {
    fetchIdCheckItem: async (itemId) => {
      fetches.push(itemId);
      return item;
    },
    markIdInviteSent: async () => undefined,
    markIdError: async () => undefined,
    markIdResult: async () => undefined,
    writeIdCheckOutcome: async (itemId, payload) => {
      writes.push({ itemId, payload });
    },
    fetchDbsItem: async () => {
      throw new Error('fetchDbsItem not expected in id-callback tests');
    },
    markDbsInviteSent: async () => undefined,
    markDbsError: async () => undefined,
    markDbsSubmitted: async () => undefined,
    markDbsResult: async () => undefined,
  };
  return { client, writes, fetches };
}

function fakeTrustid(overrides: Partial<TrustidClient> = {}): TrustidClient {
  return {
    createGuestLink: async () => ({ Success: true }),
    retrieveDocumentContainer: async () => ({ Success: true, Container: null }),
    retrieveDbsForm: async () => ({ Success: true }),
    initiateBasicDbsCheck: async () => ({ Success: true }),
    deleteGuestLink: async () => ({ Success: true }),
    ...overrides,
  };
}

type ResponseState = {
  statusCode: number;
  body?: unknown;
  ended: boolean;
  headers: Record<string, string>;
};

function mockResponse(): { res: VercelResponse; state: ResponseState } {
  const state: ResponseState = {
    statusCode: 200,
    ended: false,
    headers: {},
  };
  const res = {
    setHeader: (name: string, value: string | number | readonly string[]) => {
      state.headers[name] = String(value);
    },
    status: (code: number) => {
      state.statusCode = code;
      return res;
    },
    json: (body: unknown) => {
      state.body = body;
      state.ended = true;
      return res;
    },
    end: () => {
      state.ended = true;
      return res;
    },
  } as unknown as VercelResponse;
  return { res, state };
}

function mockRequest(opts: {
  body?: unknown;
  query?: Record<string, string | string[]>;
  method?: string;
}): VercelRequest {
  return {
    method: opts.method ?? 'POST',
    headers: { 'content-type': 'application/json' },
    body: opts.body ?? {},
    query: opts.query ?? {},
  } as unknown as VercelRequest;
}

function webhookBody(opts: { mondayItemId?: string; containerId?: string }): unknown {
  const storage: Array<{ Key: string; Value: string }> = [];
  if (opts.mondayItemId) {
    storage.push({ Key: 'ClientApplicationReference', Value: opts.mondayItemId });
  }
  if (opts.containerId) storage.push({ Key: 'ContainerId', Value: opts.containerId });
  return { Callback: { WorkflowStorage: storage } };
}

function buildHandler(deps: {
  trustidClient?: TrustidClient;
  mondayClient: MondayTrustidClient;
}) {
  return createHandler({
    trustidClient: deps.trustidClient ?? fakeTrustid(),
    mondayClient: deps.mondayClient,
    idCheckBoard,
    signalStatusValues: idCheckSignalStatusValues,
    now: fixedNow,
  });
}

// Capture console.error invocations for the duration of `fn`. Restores the
// original console.error on completion (success or throw).
async function withCapturedConsoleError<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; calls: unknown[][] }> {
  const calls: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };
  try {
    const result = await fn();
    return { result, calls };
  } finally {
    console.error = original;
  }
}

// Builders for minimal containers exercising each mapping branch.
// These are hand-built and contain only the fields the mapping reads —
// not real-shape. Test #1 uses the real captured container.
function container(opts: {
  liveness?: number | null;
  photoMatch?: { Value?: boolean; ValueUndefined?: boolean; ErrorMessage?: string | null };
  documentNotes?: string | null;
  omitPhotoMatch?: boolean;
  omitDocuments?: boolean;
  address?: { DetailedResult: string };
  omitAddress?: boolean;
}): RetrieveDocumentContainerResponse {
  const documents: Array<Record<string, unknown>> = [];
  if (!opts.omitDocuments) {
    const gdp: Array<Record<string, unknown>> = [];
    if (!opts.omitPhotoMatch) {
      gdp.push({
        Name: 'Photo Matches Applicant (TrustId)',
        Value: opts.photoMatch?.Value ?? true,
        ValueUndefined: opts.photoMatch?.ValueUndefined ?? false,
        ErrorMessage: opts.photoMatch?.ErrorMessage ?? null,
      });
    }
    documents.push({
      GeneralDocumentProperties: gdp,
      Notes: opts.documentNotes ?? null,
    });
  }
  const validations: Array<Record<string, unknown>> = [];
  if (!opts.omitAddress) {
    validations.push({
      Name: 'AddressVerification',
      DetailedResult: opts.address?.DetailedResult ?? 'Match',
    });
  }
  return {
    Success: true,
    Container: {
      LivenessTestResult: opts.liveness === undefined ? 1 : opts.liveness,
      Documents: documents,
      DocumentContainerValidationList: validations,
    },
  };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

test('processes the real captured sandbox container: Liveness Pass, Face Match Fail (with Notes), Address Fail (No Match), overall Fail', async () => {
  const item = idCheckItem({ trustIdContainerId: '67331d76-6373-47b1-83de-4c220a17c22a' });
  const monday = fakeMonday(item);
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () => ({
      Success: true,
      Container: realCapturedContainer.Container,
    }),
  });
  const handler = buildHandler({ trustidClient: trustid, mondayClient: monday.client });
  const { res, state } = mockResponse();

  await handler(
    mockRequest({
      body: webhookBody({ mondayItemId: 'item-1', containerId: '67331d76-6373-47b1-83de-4c220a17c22a' }),
    }),
    res,
  );

  assert.equal(state.statusCode, 200);
  assert.equal(monday.writes.length, 1);
  const payload = monday.writes[0].payload;
  assert.equal(payload.overallStatus, idCheckBoard.statusValues.fail);
  assert.deepEqual(payload.liveness, { status: idCheckSignalStatusValues.liveness.pass });
  assert.equal(payload.faceMatch?.status, idCheckSignalStatusValues.faceMatch.fail);
  assert.equal(payload.faceMatch?.errorText, 'Failed Test');
  assert.equal(payload.address?.status, idCheckSignalStatusValues.address.fail);
  assert.equal(payload.address?.errorText, 'No Match');
  assert.equal(payload.errorText, null);
  assert.equal(payload.lastUpdatedAt, '2026-05-15T10:00:00.000Z');
});

test('face match ValueUndefined=true maps to Unsure and overall Refer; ErrorMessage becomes face match error text', async () => {
  const item = idCheckItem({ trustIdContainerId: 'c1' });
  const monday = fakeMonday(item);
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () =>
      container({
        photoMatch: { Value: true, ValueUndefined: true, ErrorMessage: 'Auditor selected unsure.' },
      }),
  });
  const handler = buildHandler({ trustidClient: trustid, mondayClient: monday.client });
  const { res, state } = mockResponse();

  await handler(mockRequest({ body: webhookBody({ mondayItemId: 'item-1', containerId: 'c1' }) }), res);

  assert.equal(state.statusCode, 200);
  const payload = monday.writes[0].payload;
  assert.equal(payload.overallStatus, idCheckBoard.statusValues.refer);
  assert.equal(payload.faceMatch?.status, idCheckSignalStatusValues.faceMatch.unsure);
  assert.equal(payload.faceMatch?.errorText, 'Auditor selected unsure.');
});

test('all three signals pass -> overall Pass; no error text', async () => {
  const item = idCheckItem({ trustIdContainerId: 'c1' });
  const monday = fakeMonday(item);
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () =>
      container({
        liveness: 1,
        photoMatch: { Value: true, ValueUndefined: false },
        address: { DetailedResult: 'Match' },
      }),
  });
  const handler = buildHandler({ trustidClient: trustid, mondayClient: monday.client });
  const { res, state } = mockResponse();

  await handler(mockRequest({ body: webhookBody({ mondayItemId: 'item-1', containerId: 'c1' }) }), res);

  assert.equal(state.statusCode, 200);
  const payload = monday.writes[0].payload;
  assert.equal(payload.overallStatus, idCheckBoard.statusValues.pass);
  assert.equal(payload.liveness?.status, idCheckSignalStatusValues.liveness.pass);
  assert.equal(payload.faceMatch?.status, idCheckSignalStatusValues.faceMatch.pass);
  assert.equal(payload.faceMatch?.errorText, null);
  assert.equal(payload.address?.status, idCheckSignalStatusValues.address.pass);
  assert.equal(payload.address?.errorText, null);
  assert.equal(payload.errorText, null);
});

test('liveness Pass + face match Pass + address Fail -> overall Pass With Address Fail', async () => {
  const item = idCheckItem({ trustIdContainerId: 'c1' });
  const monday = fakeMonday(item);
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () =>
      container({
        liveness: 1,
        photoMatch: { Value: true, ValueUndefined: false },
        address: { DetailedResult: 'No Match' },
      }),
  });
  const handler = buildHandler({ trustidClient: trustid, mondayClient: monday.client });
  const { res, state } = mockResponse();

  await handler(mockRequest({ body: webhookBody({ mondayItemId: 'item-1', containerId: 'c1' }) }), res);

  assert.equal(state.statusCode, 200);
  const payload = monday.writes[0].payload;
  assert.equal(payload.overallStatus, idCheckBoard.statusValues.passWithAddressFail);
  assert.equal(payload.address?.status, idCheckSignalStatusValues.address.fail);
  assert.equal(payload.address?.errorText, 'No Match');
});

test('address "Not Performed" maps to Address Pass (no error text)', async () => {
  const item = idCheckItem({ trustIdContainerId: 'c1' });
  const monday = fakeMonday(item);
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () =>
      container({
        photoMatch: { Value: true, ValueUndefined: false },
        address: { DetailedResult: 'Not Performed' },
      }),
  });
  const handler = buildHandler({ trustidClient: trustid, mondayClient: monday.client });
  const { res, state } = mockResponse();

  await handler(mockRequest({ body: webhookBody({ mondayItemId: 'item-1', containerId: 'c1' }) }), res);

  assert.equal(state.statusCode, 200);
  const payload = monday.writes[0].payload;
  assert.equal(payload.address?.status, idCheckSignalStatusValues.address.pass);
  assert.equal(payload.address?.errorText, null);
  assert.equal(payload.overallStatus, idCheckBoard.statusValues.pass);
});

test('LivenessTestResult != 1 -> Liveness Fail and overall Fail', async () => {
  const item = idCheckItem({ trustIdContainerId: 'c1' });
  const monday = fakeMonday(item);
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () =>
      container({
        liveness: 2,
        photoMatch: { Value: true, ValueUndefined: false },
        address: { DetailedResult: 'Match' },
      }),
  });
  const handler = buildHandler({ trustidClient: trustid, mondayClient: monday.client });
  const { res, state } = mockResponse();

  await handler(mockRequest({ body: webhookBody({ mondayItemId: 'item-1', containerId: 'c1' }) }), res);

  assert.equal(state.statusCode, 200);
  const payload = monday.writes[0].payload;
  assert.equal(payload.liveness?.status, idCheckSignalStatusValues.liveness.fail);
  assert.equal(payload.overallStatus, idCheckBoard.statusValues.fail);
});

test('container missing Photo Matches Applicant entry -> overall Error; error text names the missing field; per-signal cols cleared', async () => {
  const item = idCheckItem({ trustIdContainerId: 'c1' });
  const monday = fakeMonday(item);
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () =>
      container({
        omitPhotoMatch: true,
      }),
  });
  const handler = buildHandler({ trustidClient: trustid, mondayClient: monday.client });
  const { res, state } = mockResponse();

  const { calls: errorCalls } = await withCapturedConsoleError(async () => {
    await handler(mockRequest({ body: webhookBody({ mondayItemId: 'item-1', containerId: 'c1' }) }), res);
  });

  assert.equal(state.statusCode, 200);
  const payload = monday.writes[0].payload;
  assert.equal(payload.overallStatus, idCheckBoard.statusValues.error);
  assert.equal(payload.liveness, null);
  assert.equal(payload.faceMatch, null);
  assert.equal(payload.address, null);
  assert.match(payload.errorText ?? '', /Photo Matches Applicant/);
  assert.ok(errorCalls.some((c) => c[0] === 'trustid.idCallbackV2.containerMissingFields'));
});

test('container missing AddressVerification entry -> overall Error; error text names address', async () => {
  const item = idCheckItem({ trustIdContainerId: 'c1' });
  const monday = fakeMonday(item);
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () => container({ omitAddress: true }),
  });
  const handler = buildHandler({ trustidClient: trustid, mondayClient: monday.client });
  const { res, state } = mockResponse();

  await withCapturedConsoleError(async () => {
    await handler(mockRequest({ body: webhookBody({ mondayItemId: 'item-1', containerId: 'c1' }) }), res);
  });

  assert.equal(state.statusCode, 200);
  const payload = monday.writes[0].payload;
  assert.equal(payload.overallStatus, idCheckBoard.statusValues.error);
  assert.match(payload.errorText ?? '', /AddressVerification/);
});

test('container missing LivenessTestResult -> overall Error; error text names liveness', async () => {
  const item = idCheckItem({ trustIdContainerId: 'c1' });
  const monday = fakeMonday(item);
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () => container({ liveness: null }),
  });
  const handler = buildHandler({ trustidClient: trustid, mondayClient: monday.client });
  const { res, state } = mockResponse();

  await withCapturedConsoleError(async () => {
    await handler(mockRequest({ body: webhookBody({ mondayItemId: 'item-1', containerId: 'c1' }) }), res);
  });

  assert.equal(state.statusCode, 200);
  const payload = monday.writes[0].payload;
  assert.equal(payload.overallStatus, idCheckBoard.statusValues.error);
  assert.match(payload.errorText ?? '', /LivenessTestResult/);
});

test('multiple missing required fields -> error text lists all', async () => {
  const item = idCheckItem({ trustIdContainerId: 'c1' });
  const monday = fakeMonday(item);
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () =>
      container({ liveness: null, omitPhotoMatch: true, omitAddress: true }),
  });
  const handler = buildHandler({ trustidClient: trustid, mondayClient: monday.client });
  const { res, state } = mockResponse();

  await withCapturedConsoleError(async () => {
    await handler(mockRequest({ body: webhookBody({ mondayItemId: 'item-1', containerId: 'c1' }) }), res);
  });

  assert.equal(state.statusCode, 200);
  const text = monday.writes[0].payload.errorText ?? '';
  assert.match(text, /LivenessTestResult/);
  assert.match(text, /Photo Matches Applicant/);
  assert.match(text, /AddressVerification/);
});

test('retrieveDocumentContainer throws -> overall Error; error text = exception message', async () => {
  const item = idCheckItem({ trustIdContainerId: 'c1' });
  const monday = fakeMonday(item);
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () => {
      throw new TrustidApiError('TrustID request failed with 503', 503, 'upstream down');
    },
  });
  const handler = buildHandler({ trustidClient: trustid, mondayClient: monday.client });
  const { res, state } = mockResponse();

  await withCapturedConsoleError(async () => {
    await handler(mockRequest({ body: webhookBody({ mondayItemId: 'item-1', containerId: 'c1' }) }), res);
  });

  assert.equal(state.statusCode, 200);
  const payload = monday.writes[0].payload;
  assert.equal(payload.overallStatus, idCheckBoard.statusValues.error);
  assert.equal(payload.errorText, 'TrustID request failed with 503');
});

test('retrieveDocumentContainer returns Success: false -> overall Error; error text = response Message', async () => {
  const item = idCheckItem({ trustIdContainerId: 'c1' });
  const monday = fakeMonday(item);
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () => ({
      Success: false,
      Message: 'Container not found in datastore',
    }),
  });
  const handler = buildHandler({ trustidClient: trustid, mondayClient: monday.client });
  const { res, state } = mockResponse();

  await withCapturedConsoleError(async () => {
    await handler(mockRequest({ body: webhookBody({ mondayItemId: 'item-1', containerId: 'c1' }) }), res);
  });

  assert.equal(state.statusCode, 200);
  const payload = monday.writes[0].payload;
  assert.equal(payload.overallStatus, idCheckBoard.statusValues.error);
  assert.equal(payload.errorText, 'Container not found in datastore');
});

test('webhook missing both query mondayItemId and ClientApplicationReference -> 400, no Monday writes', async () => {
  const item = idCheckItem();
  const monday = fakeMonday(item);
  const handler = buildHandler({ mondayClient: monday.client });
  const { res, state } = mockResponse();

  await withCapturedConsoleError(async () => {
    await handler(
      mockRequest({ body: { Callback: { WorkflowStorage: [] } } }),
      res,
    );
  });

  assert.equal(state.statusCode, 400);
  assert.equal(monday.writes.length, 0);
  assert.equal(monday.fetches.length, 0);
  assert.match((state.body as { error: string }).error, /Missing mondayItemId/);
});

test('Monday item already in terminal status -> guard fires; no TrustID call; no Monday write; 200 already-terminal', async () => {
  const item = idCheckItem({ status: idCheckBoard.statusValues.pass });
  const monday = fakeMonday(item);
  let trustidCalls = 0;
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () => {
      trustidCalls += 1;
      return { Success: true, Container: null };
    },
  });
  const handler = buildHandler({ trustidClient: trustid, mondayClient: monday.client });
  const { res, state } = mockResponse();

  await handler(
    mockRequest({ body: webhookBody({ mondayItemId: 'item-1', containerId: 'c1' }) }),
    res,
  );

  assert.equal(state.statusCode, 200);
  assert.equal(monday.writes.length, 0);
  assert.equal(trustidCalls, 0);
  assert.equal((state.body as { outcome: string }).outcome, 'already-terminal');
  assert.equal((state.body as { currentStatus: string }).currentStatus, idCheckBoard.statusValues.pass);
});

test('container ID missing from webhook and from Monday item -> overall Error, no TrustID call', async () => {
  const item = idCheckItem({ trustIdContainerId: null });
  const monday = fakeMonday(item);
  let trustidCalls = 0;
  const trustid = fakeTrustid({
    retrieveDocumentContainer: async () => {
      trustidCalls += 1;
      return { Success: true, Container: null };
    },
  });
  const handler = buildHandler({ trustidClient: trustid, mondayClient: monday.client });
  const { res, state } = mockResponse();

  await withCapturedConsoleError(async () => {
    await handler(
      mockRequest({ body: webhookBody({ mondayItemId: 'item-1' }) }),
      res,
    );
  });

  assert.equal(state.statusCode, 200);
  assert.equal(trustidCalls, 0);
  assert.equal(monday.writes.length, 1);
  const payload = monday.writes[0].payload;
  assert.equal(payload.overallStatus, idCheckBoard.statusValues.error);
  assert.match(payload.errorText ?? '', /No container ID/);
});
