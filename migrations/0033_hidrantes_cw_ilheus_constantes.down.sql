-- Reverse 0033: restore the uniform 0032 constants for CW Ilhéus
-- (mangueira 4, esguicho 2, chave_storz 2). Constant-only; checklist untouched.
UPDATE hidrantes
   SET mangueira = '4', esguicho = '2', chave_storz = '2'
 WHERE unidade = 'CW Ilhéus';
