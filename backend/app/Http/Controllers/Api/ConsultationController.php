<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ConsultationRecord;
use App\Models\QueueRecord;
use App\Models\StaffProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ConsultationController extends Controller
{
    private function scopedQuery(Request $request)
    {
        $user = $request->user();

        abort_unless(
            in_array($user->role, [
                'administrator', 'medical_staff'
            ], true),
            403,
            'Only administrators and medical staff can view consultations.'
        );

        $query = ConsultationRecord::with([
            'queueRecord.appointment.patient',
            'staffProfile.user',
        ]);

        if ($user->role === 'medical_staff') {
            $staff = StaffProfile::where(
                'user_id', $user->id
            )->firstOrFail();

            $query->where('staff_profile_id', $staff->id);
        }

        return $query;
    }

    public function index(Request $request)
    {
        return $this->scopedQuery($request)
            ->latest()
            ->paginate(10);
    }

    public function store(Request $request)
    {
        abort_unless(
            in_array($request->user()->role, [
                'administrator', 'medical_staff'
            ], true),
            403,
            'Access denied.'
        );

        $data = $request->validate([
            'queue_record_id' => 'required|exists:queue_records,id',
        ]);

        $queue = QueueRecord::with('appointment')
            ->findOrFail($data['queue_record_id']);

        abort_unless(
            in_array($queue->status, ['called', 'in_consultation'], true),
            422,
            'The patient must be called before consultation begins.'
        );

        $staff = $request->user()->staffProfile;

        if ($request->user()->role === 'medical_staff') {
            abort_unless(
                $staff &&
                $queue->appointment->staff_profile_id === $staff->id,
                403,
                'You can only consult patients assigned to you.'
            );
        } else {
            $request->validate([
                'staff_profile_id' => 'required|exists:staff_profiles,id',
            ]);

            $staff = StaffProfile::findOrFail(
                $request->input('staff_profile_id')
            );

            abort_unless(
                $staff->user?->role === 'medical_staff',
                422,
                'Consultations can only be assigned to medical staff.'
            );
        }

        if (!$staff) {
            return response()->json([
                'message' => 'A staff profile is required.',
            ], 422);
        }

        $consultation = DB::transaction(function () use ($queue, $staff) {
            $lockedQueue = QueueRecord::whereKey($queue->id)
                ->lockForUpdate()
                ->firstOrFail();

            $consultation = ConsultationRecord::firstOrCreate(
                ['queue_record_id' => $lockedQueue->id],
                [
                    'staff_profile_id' => $staff->id,
                    'start_time' => now(),
                    'status' => 'in_progress',
                ]
            );

            $lockedQueue->update(['status' => 'in_consultation']);

            return $consultation;
        });

        return response()->json([
            'message' => 'Consultation started.',
            'consultation' => $consultation->load(
                'queueRecord.appointment.patient',
                'staffProfile.user'
            ),
        ], 201);
    }

    public function show(Request $request, ConsultationRecord $consultation)
    {
        $this->authorizeConsultation($request, $consultation);

        return $consultation->load(
            'queueRecord.appointment.patient',
            'staffProfile.user'
        );
    }

    public function update(
        Request $request,
        ConsultationRecord $consultation
    ) {
        $this->authorizeConsultation($request, $consultation);

        $data = $request->validate([
            'status' => ['sometimes', 'required', Rule::in(['in_progress', 'completed'])],
            'staff_profile_id' => [
                'sometimes',
                'required',
                'exists:staff_profiles,id',
            ],
            'start_time' => ['sometimes', 'nullable', 'date'],
            'end_time' => ['sometimes', 'nullable', 'date'],
        ]);

        if ($request->user()->role === 'medical_staff') {
            abort_unless(
                count(array_intersect(
                    array_keys($data),
                    ['staff_profile_id', 'start_time', 'end_time']
                )) === 0,
                403,
                'Only administrators can edit consultation details.'
            );
        }

        if (isset($data['staff_profile_id'])) {
            $staff = StaffProfile::with('user')->findOrFail(
                $data['staff_profile_id']
            );

            abort_unless(
                $staff->user?->role === 'medical_staff',
                422,
                'Consultations can only be assigned to medical staff.'
            );
        }

        $startTime = $data['start_time'] ?? $consultation->start_time?->toDateTimeString();
        $endTime = $data['end_time'] ?? $consultation->end_time?->toDateTimeString();

        if ($startTime && $endTime) {
            abort_unless(
                strtotime($endTime) >= strtotime($startTime),
                422,
                'The consultation end time must be after its start time.'
            );
        }

        if ($consultation->status === 'completed' &&
            ($data['status'] ?? 'completed') !== 'completed') {
            return response()->json([
                'message' => 'Completed consultations cannot be changed.',
            ], 422);
        }

        $status = $data['status'] ?? $consultation->status;
        $update = collect($data)->only([
            'staff_profile_id',
            'start_time',
            'end_time',
        ])->all();

        if ($status === 'completed') {
            $update['status'] = 'completed';
            $update['end_time'] = $data['end_time'] ?? now();
        } elseif (isset($data['status'])) {
            $update['status'] = $status;
        }

        DB::transaction(function () use ($consultation, $update, $status) {
            if ($update) {
                $consultation->update($update);
            }

            if ($status === 'completed') {
                $queue = $consultation->queueRecord;
                $queue->update(['status' => 'completed']);
                $queue->appointment->update(['status' => 'completed']);
            }
        });

        return response()->json([
            'message' => 'Consultation updated.',
            'consultation' => $consultation->fresh()->load(
                'queueRecord.appointment.patient',
                'staffProfile.user'
            ),
        ]);
    }

    public function destroy(
        Request $request,
        ConsultationRecord $consultation
    ) {
        abort_unless(
            $request->user()->role === 'administrator',
            403,
            'Only administrators can delete consultation records.'
        );

        $consultation->delete();

        return response()->json([
            'message' => 'Consultation record deleted.',
        ]);
    }

    private function authorizeConsultation(
        Request $request,
        ConsultationRecord $consultation
    ): void {
        $user = $request->user();

        if ($user->role === 'administrator') {
            return;
        }

        if ($user->role === 'medical_staff') {
            $staff = StaffProfile::where(
                'user_id', $user->id
            )->first();

            abort_unless(
                $staff &&
                $consultation->staff_profile_id === $staff->id,
                403,
                'You can only access your assigned consultations.'
            );

            return;
        }

        abort(403, 'Access denied.');
    }
}
