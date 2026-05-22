import Link from 'next/link';
import { ArrowLeft, FileText, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { getApartmentPdfImportPreviewAction } from '@/lib/apartments/import-actions';
import { getCitiesAction } from '@/lib/cities/actions';
import { getDistrictsAction } from '@/lib/districts/actions';
import { ApartmentPdfImportClient } from './apartment-pdf-import-client';

interface ApartmentPdfImportPageProps {
  searchParams: Promise<{ preview?: string | string[]; error?: string | string[] }>;
}

function getStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ApartmentPdfImportPage({ searchParams }: ApartmentPdfImportPageProps) {
  const params = await searchParams;
  const previewImportId = getStringParam(params.preview);
  const errorMessage = getStringParam(params.error);
  const [citiesResult, districtsResult] = await Promise.all([
    getCitiesAction(),
    getDistrictsAction(),
  ]);
  const initialPreview = previewImportId
    ? await getApartmentPdfImportPreviewAction(previewImportId)
    : null;

  const cities = (citiesResult.cities || []).map((city) => ({
    id: city.id,
    name: city.name,
  }));
  const districts = (districtsResult.districts || []).map((district) => ({
    id: district.id,
    cityId: district.cityId,
    name: district.name,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Импорт квартир из PDF"
        subtitle="Загрузите PDF, проверьте распознанные строки и подтвердите добавление объектов"
        icon={<FileText className="h-6 w-6 text-white" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/apartments/import/history">
                <History className="h-4 w-4" />
                История импортов
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/apartments">
                <ArrowLeft className="h-4 w-4" />
                К списку квартир
              </Link>
            </Button>
          </div>
        }
      />

      <ApartmentPdfImportClient
        cities={cities}
        districts={districts}
        initialPreview={initialPreview}
        initialError={initialPreview?.success ? null : initialPreview?.error || errorMessage || null}
      />
    </div>
  );
}
