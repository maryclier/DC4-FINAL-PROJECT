<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PatientController extends Controller
{
    private function authorizeStaff(Request $request): void
    {
        abort_unless(
            in_array($request->user()->role, [
                'administrator', 'receptionist'
            ], true),
            403,
            'Only authorized clinic staff can manage patient records.'
        );
    }

    public function index(Request $request)
    {
        $this->authorizeStaff($request);

        $query = Patient::with('user')->latest();

        if ($request->filled('search')) {
            $search = $request->search;

            $query->where(function ($q) use ($search) {
                $q->where('full_name', 'like', "%{$search}%")
                  ->orWhere('patient_number', 'like', "%{$search}%")
                  ->orWhere('contact_number', 'like', "%{$search}%");
            });
        }

        return $query->paginate(10);
    }

    public function store(Request $request)
    {
        $this->authorizeStaff($request);

        $data = $request->validate([
            'full_name' => 'required|string|max:255',
            'contact_number' => 'nullable|string|max:30',
        ]);

        $patient = Patient::create([
            ...$data,
            'patient_number' => 'PAT-' . strtoupper(
                bin2hex(random_bytes(4))
            ),
        ]);

        return response()->json([
            'message' => 'Patient registered successfully.',
            'patient' => $patient,
        ], 201);
    }

    public function show(Request $request, Patient $patient)
    {
        $user = $request->user();

        if ($user->role === 'patient') {
            abort_unless(
                $patient->user_id === $user->id,
                403,
                'You may only view your own profile.'
            );
        } else {
            $this->authorizeStaff($request);
        }

        return $patient->load('user', 'appointments.queueRecord');
    }

    public function update(Request $request, Patient $patient)
    {
        $this->authorizeStaff($request);

        $data = $request->validate([
            'full_name' => 'sometimes|required|string|max:255',
            'contact_number' => 'nullable|string|max:30',
        ]);

        $patient->update($data);

        return response()->json([
            'message' => 'Patient information updated.',
            'patient' => $patient->fresh(),
        ]);
    }

    public function destroy(Request $request, Patient $patient)
    {
        $this->authorizeStaff($request);

        if ($patient->appointments()->exists()) {
            return response()->json([
                'message' => 'This patient has appointment records and cannot be deleted.',
            ], 422);
        }

        DB::transaction(function () use ($patient) {
            $user = $patient->user;
            $patient->delete();

            if ($user) {
                $user->delete();
            }
        });

        return response()->json([
            'message' => 'Patient deleted successfully.',
        ]);
    }
}
