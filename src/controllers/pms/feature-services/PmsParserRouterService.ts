import { OrganizationModel } from "../../../models/OrganizationModel";
import {
  resolvePmsParserType,
  type PmsParserType,
} from "../../../config/pmsParserRegistry";
import type {
  PmsParseFileInput,
  PmsParsePasteInput,
  PmsParseRowsInput,
  PmsParserAdapter,
  PmsParserResult,
} from "../feature-utils/pmsParserContract";
import { PmsParserError } from "../feature-utils/PmsParserError";
import { DefaultPmsParserService } from "./DefaultPmsParserService";
import { DentalEmrPmsParserService } from "./DentalEmrPmsParserService";

const PARSER_SERVICES: Record<PmsParserType, PmsParserAdapter> = {
  default: DefaultPmsParserService,
  dentalemr: DentalEmrPmsParserService,
};

export class PmsParserRouterService {
  static async parseRows(input: PmsParseRowsInput): Promise<PmsParserResult> {
    const parser = await this.resolveParser(input.organizationId);
    return parser.parseRows(input);
  }

  static async parsePaste(input: PmsParsePasteInput): Promise<PmsParserResult> {
    const parser = await this.resolveParser(input.organizationId);
    return parser.parsePaste(input);
  }

  static async parseFile(input: PmsParseFileInput): Promise<PmsParserResult> {
    const parser = await this.resolveParser(input.organizationId);
    return parser.parseFile(input);
  }

  private static async resolveParser(
    organizationId: number
  ): Promise<PmsParserAdapter> {
    const organization = await OrganizationModel.findPmsTypeById(organizationId);
    if (!organization) {
      throw new PmsParserError(
        "PMS_ORGANIZATION_NOT_FOUND",
        "Organization not found for PMS parsing.",
        404
      );
    }

    const parserType = resolvePmsParserType(
      organization.pms_type,
      organizationId
    );
    return PARSER_SERVICES[parserType];
  }
}
