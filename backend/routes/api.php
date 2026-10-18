<?php

use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ConsultationController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\PatientController;
use App\Http\Controllers\Api\QueueController;
use App\Http\Controllers\Api\StaffController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/dashboard', [DashboardController::class, 'index']);

    Route::apiResource('patients', PatientController::class);
    Route::apiResource('staff', StaffController::class)
        ->parameters(['staff' => 'staff']);

    Route::apiResource('appointments', AppointmentController::class);

    Route::get('/queue', [QueueController::class, 'index']);
    Route::post('/appointments/{appointment}/arrive', [QueueController::class, 'arrive']);
    Route::patch('/queue/{queueRecord}', [QueueController::class, 'updateStatus']);

    Route::get('/consultations', [ConsultationController::class, 'index']);
    Route::post('/consultations', [ConsultationController::class, 'store']);
    Route::get('/consultations/{consultation}', [ConsultationController::class, 'show']);
    Route::patch('/consultations/{consultation}', [ConsultationController::class, 'update']);
    Route::delete('/consultations/{consultation}', [ConsultationController::class, 'destroy']);
});