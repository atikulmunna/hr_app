import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/permissions.decorator';
import {
  AddVersionInput,
  CreateDocumentInput,
  DocumentService,
} from './document.service';

// Documents and compliance (T-3.4, FR-M1-07, 08, 09). HR manages the document
// vault under /documents with document:read / document:manage; employees see the
// documents shared with them and e-sign policy acknowledgements under /me,
// self-service with no permission.
@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentService) {}

  // --- HR vault.

  @RequirePermissions('document:read')
  @Get('documents')
  list(
    @Query('employeeId') employeeId?: string,
    @Query('category') category?: string,
  ) {
    return this.documents.list({
      employeeId: employeeId || undefined,
      category: category || undefined,
    });
  }

  @RequirePermissions('document:read')
  @Get('documents/:id')
  get(@Param('id') id: string) {
    return this.documents.get(id);
  }

  @RequirePermissions('document:manage')
  @Post('documents')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateDocumentInput) {
    return this.documents.create(user, body);
  }

  @RequirePermissions('document:manage')
  @Post('documents/:id/versions')
  addVersion(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: AddVersionInput,
  ) {
    return this.documents.addVersion(user, id, body);
  }

  @RequirePermissions('document:manage')
  @Delete('documents/:id')
  remove(@Param('id') id: string) {
    return this.documents.remove(id);
  }

  // --- Employee self-service.

  @Get('me/documents')
  mine(@CurrentUser() user: AuthUser) {
    return this.documents.mine(user);
  }

  @Post('me/documents/:id/acknowledge')
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { signerName?: string },
    @Ip() ip: string,
  ) {
    return this.documents.acknowledge(user, id, body?.signerName ?? '', ip);
  }
}
