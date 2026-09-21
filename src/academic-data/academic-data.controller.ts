import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AcademicDataService } from './academic-data.service';


@ApiTags('Academic Data')
@Controller('academic-data')
export class AcademicDataController {
  constructor(private readonly academicDataService: AcademicDataService) {}

  @Get('universities')
  @ApiOperation({ summary: 'List all universities' })
  async getUniversities() {
    return this.academicDataService.getUniversities();
  }

  @Get('universities/:id/faculties')
  @ApiOperation({ summary: 'List faculties for a specific university' })
  @ApiParam({ name: 'id', description: 'University ID' })
  async getFacultiesByUniversity(@Param('id') universityId: string) {
    return this.academicDataService.getFacultiesByUniversity(universityId);
  }

  @Get('faculties/:id/departments')
  @ApiOperation({ summary: 'List departments for a specific faculty' })
  @ApiParam({ name: 'id', description: 'Faculty ID' })
  async getDepartmentsByFaculty(@Param('id') facultyId: string) {
    return this.academicDataService.getDepartmentsByFaculty(facultyId);
  }

  @Get('departments/:id/programs')
  @ApiOperation({ summary: 'List programs for a specific department' })
  @ApiParam({ name: 'id', description: 'Department ID' })
  async getProgramsByDepartment(@Param('id') departmentId: string) {
    return this.academicDataService.getProgramsByDepartment(departmentId);
  }

  @Get('faculties/:id/programs')
  @ApiOperation({ summary: 'List programs for a specific faculty (flat structure)' })
  @ApiParam({ name: 'id', description: 'Faculty ID' })
  async getProgramsByFaculty(@Param('id') facultyId: string) {
    return this.academicDataService.getProgramsByFaculty(facultyId);
  }
}
