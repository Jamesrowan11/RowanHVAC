/** Tick any number of technicians for a job (form field: technicianIds). */
export function CrewPicker({
  techs,
  selected = [],
}: {
  techs: { id: string; name: string; role: string; active?: boolean }[];
  selected?: string[];
}) {
  const chosen = new Set(selected);
  // Ticked people first (in crew order), then everyone else.
  const ordered = [
    ...selected.map((id) => techs.find((t) => t.id === id)).filter((t): t is (typeof techs)[number] => Boolean(t)),
    ...techs.filter((t) => !chosen.has(t.id)),
  ];
  return (
    <fieldset>
      <legend className="label">Technicians (tick everyone on the job)</legend>
      {ordered.length === 0 ? (
        <p className="text-sm text-navy-500">No technicians yet. Add employees under Users.</p>
      ) : (
        <div className="grid max-h-52 gap-1 overflow-y-auto rounded-lg border border-navy-100 p-2 sm:grid-cols-2">
          {ordered.map((t) => (
            <label key={t.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm text-navy-800 hover:bg-navy-50">
              <input type="checkbox" name="technicianIds" value={t.id} defaultChecked={chosen.has(t.id)} />
              <span>
                {t.name}
                <span className="text-xs text-navy-400">
                  {" "}
                  · {t.role === "ADMIN" ? "Admin" : "Employee"}
                  {t.active === false ? " · inactive" : ""}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-navy-400">Leave all unticked to keep the job unassigned.</p>
    </fieldset>
  );
}
