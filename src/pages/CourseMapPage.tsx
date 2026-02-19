import { useEffect, useState } from 'react';
import { HoleMap } from '../components/HoleMap';
import { courseOptions, type CourseId, type HoleMapData } from '../data/courseMapData';
import { getHoleFromCourseMap } from '../data/courseMapRepository';
import { Card } from '../ui/components';
import { useI18n } from '../app/i18n';

export function CourseMapPage() {
  const { t } = useI18n();
  const [courseId, setCourseId] = useState<CourseId>('vale-da-pinta');
  const [holeNumber, setHoleNumber] = useState(1);
  const [hole, setHole] = useState<HoleMapData | null>(null);
  const [loadingHole, setLoadingHole] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoadingHole(true);
      const result = await getHoleFromCourseMap(courseId, holeNumber);
      if (!mounted) return;
      setHole(result ?? null);
      setLoadingHole(false);
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [courseId, holeNumber]);

  return (
    <section className="space-y-4">
      <Card>
        <h2 className="text-xl font-semibold">{t('courseMap.title')}</h2>
        <p className="mt-1 text-sm text-gray-600">{t('courseMap.measurementNote')}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            {t('courseMap.selectCourse')}
            <select className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2" value={courseId} onChange={(event) => setCourseId(event.target.value as CourseId)}>
              {courseOptions.map((course) => (
                <option key={course.id} value={course.id}>{course.label}</option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            {t('courseMap.selectHole')}
            <select className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2" value={holeNumber} onChange={(event) => setHoleNumber(Number(event.target.value))}>
              {Array.from({ length: 18 }, (_, index) => index + 1).map((number) => (
                <option key={number} value={number}>{t('courseMap.selectHole')} {number}</option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {loadingHole ? (
        <Card className="space-y-3">
          <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-56 animate-pulse rounded bg-gray-200" />
          <div className="aspect-[16/9] w-full animate-pulse rounded-xl bg-gray-200" />
        </Card>
      ) : !hole ? (
        <Card>{t('courseMap.noHoleData')}</Card>
      ) : (
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><p className="text-gray-500">{t('courseMap.par')}</p><p className="text-base font-semibold">{hole.par}</p></div>
            <div><p className="text-gray-500">{t('courseMap.strokeIndex')}</p><p className="text-base font-semibold">{hole.strokeIndex}</p></div>
            <div><p className="text-gray-500">{t('courseMap.teeWhite')}</p><p className="text-base font-semibold">{hole.yardages.white}m</p></div>
            <div><p className="text-gray-500">{t('courseMap.teeYellow')}</p><p className="text-base font-semibold">{hole.yardages.yellow}m</p></div>
          </div>
          {hole.yardages.red && <p className="text-sm text-gray-600">{t('courseMap.teeRed')}: {hole.yardages.red}m</p>}
          {hole.yardages.orange && <p className="text-sm text-gray-600">{t('courseMap.teeOrange')}: {hole.yardages.orange}m</p>}
          {hole.layoutSummary && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-semibold">{t('courseMap.layoutSummary')}</p>
              <p>{hole.layoutSummary}</p>
            </div>
          )}
          <HoleMap hole={hole} />
        </Card>
      )}
    </section>
  );
}
